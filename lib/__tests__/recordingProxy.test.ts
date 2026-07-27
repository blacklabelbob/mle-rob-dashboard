import { describe, expect, it } from "vitest";
import { proxyResponse, upstreamRequest } from "@/lib/calls/recordingProxy";

const TWILIO_URL =
  "https://api.twilio.com/2010-04-01/Accounts/AC00000000000000000000000000000000/Recordings/RE11111111111111111111111111111111.mp3";
const CRED = { user: "SK00000000000000000000000000000000", pass: "s3cret-key-material" };

/** Case-insensitive header lookup, the shape `Response.headers.get` guarantees. */
const headersOf = (h: Record<string, string>) => (name: string) => h[name.toLowerCase()] ?? null;

describe("upstreamRequest", () => {
  it("fetches an allow-listed Twilio host with basic auth", () => {
    const req = upstreamRequest({ storedUrl: TWILIO_URL, credential: CRED });
    expect(req.kind).toBe("request");
    if (req.kind !== "request") throw new Error("unreachable");
    expect(req.url).toBe(TWILIO_URL);
    expect(req.headers.Authorization).toBe(`Basic ${Buffer.from(`${CRED.user}:${CRED.pass}`).toString("base64")}`);
    expect(req.headers.Accept).toBe("audio/*");
  });

  it("REFUSES a foreign host and attaches NO credential to it (rules 1 + 2)", () => {
    for (const host of [
      "https://evil.example/rec.mp3",
      // The exact string a `.endsWith(".twilio.com")` check would wave through.
      "https://api.twilio.com.evil.example/rec.mp3",
      "https://twilio.com.attacker.test/rec.mp3",
      "https://notapi.twilio.com/rec.mp3",
      "https://169.254.169.254/latest/meta-data/",
    ]) {
      const req = upstreamRequest({ storedUrl: host, credential: CRED });
      expect(req.kind).toBe("refused");
      // The whole rule: no request object exists, so no header carrying the token does.
      expect(JSON.stringify(req)).not.toContain(CRED.pass);
    }
  });

  it("refuses a non-https or unparseable stored url before building a header", () => {
    for (const url of ["http://api.twilio.com/rec.mp3", "file:///etc/passwd", "ftp://api.twilio.com/x", "not a url"]) {
      expect(upstreamRequest({ storedUrl: url, credential: CRED }).kind).toBe("refused");
    }
  });

  it("answers 404 for a call with no recording, 503 for an unconfigured credential", () => {
    // Two different facts a rep would report differently: nothing to play vs we cannot play.
    const none = upstreamRequest({ storedUrl: "   ", credential: CRED });
    expect(none).toMatchObject({ kind: "refused", status: 404 });

    for (const credential of [null, { user: "", pass: "x" }, { user: "x", pass: "" }]) {
      expect(upstreamRequest({ storedUrl: TWILIO_URL, credential })).toMatchObject({
        kind: "refused",
        status: 503,
      });
    }
  });

  it("forwards the rep's Range verbatim, and omits it when absent (rule 3)", () => {
    const ranged = upstreamRequest({ storedUrl: TWILIO_URL, credential: CRED, range: "bytes=1024-4095" });
    if (ranged.kind !== "request") throw new Error("unreachable");
    expect(ranged.headers.Range).toBe("bytes=1024-4095");

    for (const range of [null, undefined, "  "]) {
      const plain = upstreamRequest({ storedUrl: TWILIO_URL, credential: CRED, range });
      if (plain.kind !== "request") throw new Error("unreachable");
      expect(plain.headers).not.toHaveProperty("Range");
    }
  });

  it("never names the credential in a refusal reason", () => {
    const req = upstreamRequest({ storedUrl: "https://evil.example/x.mp3", credential: CRED });
    if (req.kind !== "refused") throw new Error("unreachable");
    expect(req.reason).toContain("evil.example");
    expect(req.reason).not.toContain(CRED.user);
  });
});

describe("proxyResponse", () => {
  it("passes a 200 audio response through with only allow-listed headers (rule 4)", () => {
    const out = proxyResponse({
      status: 200,
      header: headersOf({
        "content-type": "audio/mpeg",
        "content-length": "482112",
        "accept-ranges": "bytes",
        etag: '"abc"',
        // Neither of these is ours to relay.
        "set-cookie": "sid=deadbeef; Path=/",
        "www-authenticate": 'Basic realm="Twilio"',
      }),
    });
    expect(out.kind).toBe("stream");
    if (out.kind !== "stream") throw new Error("unreachable");
    expect(out.status).toBe(200);
    expect(out.headers["content-type"]).toBe("audio/mpeg");
    expect(out.headers["content-length"]).toBe("482112");
    expect(out.headers).not.toHaveProperty("set-cookie");
    expect(out.headers).not.toHaveProperty("www-authenticate");
  });

  it("KEEPS A 206 A 206, with its content-range (rule 3)", () => {
    const out = proxyResponse({
      status: 206,
      header: headersOf({
        "content-type": "audio/mpeg",
        "content-range": "bytes 1024-4095/482112",
        "content-length": "3072",
      }),
    });
    if (out.kind !== "stream") throw new Error("unreachable");
    expect(out.status).toBe(206);
    expect(out.headers["content-range"]).toBe("bytes 1024-4095/482112");
  });

  it("refuses a 206 that carries no content-range rather than letting a seek land wrong", () => {
    expect(proxyResponse({ status: 206, header: headersOf({ "content-type": "audio/mpeg" }) })).toMatchObject({
      kind: "error",
      status: 502,
    });
  });

  it("advertises byte ranges on a full response so the scrub bar exists at all", () => {
    const out = proxyResponse({ status: 200, header: headersOf({ "content-type": "audio/x-wav" }) });
    if (out.kind !== "stream") throw new Error("unreachable");
    expect(out.headers["accept-ranges"]).toBe("bytes");
  });

  it("turns an upstream 401/403 into OUR 502, never a 401 at the rep (rule 6)", () => {
    for (const status of [401, 403, 429, 500, 503]) {
      expect(proxyResponse({ status, header: () => null })).toMatchObject({ kind: "error", status: 502 });
    }
    // 404 stays 404: upstream genuinely has no media for this recording.
    expect(proxyResponse({ status: 404, header: () => null })).toMatchObject({ kind: "error", status: 404 });
  });

  it("rejects an HTML error page served with a 200 instead of piping it into <audio>", () => {
    expect(
      proxyResponse({ status: 200, header: headersOf({ "content-type": "text/html; charset=utf-8" }) })
    ).toMatchObject({ kind: "error", status: 502 });
    // Twilio's generic binary type is real audio, and is allowed.
    expect(
      proxyResponse({ status: 200, header: headersOf({ "content-type": "application/octet-stream" }) }).kind
    ).toBe("stream");
  });

  it("never lets these bytes into a shared cache (rule 5)", () => {
    const out = proxyResponse({ status: 200, header: headersOf({ "content-type": "audio/mpeg" }) });
    if (out.kind !== "stream") throw new Error("unreachable");
    expect(out.headers["cache-control"]).toContain("no-store");
    expect(out.headers["cdn-cache-control"]).toBe("no-store");
    expect(out.headers["referrer-policy"]).toBe("no-referrer");
    expect(out.headers["x-content-type-options"]).toBe("nosniff");
    expect(out.headers["content-disposition"]).toBe("inline");
  });
});
