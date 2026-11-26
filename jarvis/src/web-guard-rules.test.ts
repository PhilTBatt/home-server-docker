import assert from "node:assert/strict";
import { test } from "node:test";
import { addressOf, bareNumber, hasLogin, notAnAddress, notWeb, oddPort, privateAddress, privateName, siteOf, twinsOf } from "./web-guard-rules.js";

test("an ordinary public page is let through, by its name", () => {
  assert.deepEqual(addressOf("https://nodejs.org/en/blog/release/v26.0.0"), { host: "nodejs.org" });
  assert.deepEqual(addressOf("http://Example.ORG./a?b=c#d"), { host: "example.org" });
  assert.deepEqual(addressOf("https://sub.example.co.uk:443/"), { host: "sub.example.co.uk" });
});

test("anything that isn't an http or https address is refused", () => {
  assert.deepEqual(addressOf("not an address"), { refused: notAnAddress });
  assert.deepEqual(addressOf(""), { refused: notAnAddress });
  for (const raw of ["file:///etc/passwd", "ftp://example.org/a", "javascript:alert(1)", "data:text/plain,hi", "ws://example.org/"]) assert.deepEqual(addressOf(raw), { refused: notWeb }, raw);
});

test("an address with a name or password in it is refused", () => {
  assert.deepEqual(addressOf("https://user:pass@example.org/"), { refused: hasLogin });
  assert.deepEqual(addressOf("https://user@example.org/"), { refused: hasLogin });
});

test("an address on an unusual port is refused, and the usual ports are fine", () => {
  for (const raw of ["https://example.org:8443/", "http://example.org:8080/", "https://example.org:22/", "http://example.org:443/"]) assert.deepEqual(addressOf(raw), { refused: oddPort }, raw);
  assert.deepEqual(addressOf("http://example.org:80/"), { host: "example.org" });
});

test("an address that is a number is refused however the number is written", () => {
  for (const raw of ["https://192.168.0.1/admin", "http://127.0.0.1/", "https://8.8.8.8/", "http://2130706433/", "http://0x7f.0.0.1/", "http://017700000001/", "http://127.1/", "https://[::1]/", "https://[fe80::1]/", "https://[2606:4700:4700::1111]/", "http://[::ffff:192.168.0.1]/", "http://192.168.1.50./"]) assert.deepEqual(addressOf(raw), { refused: bareNumber }, raw);
});

test("a name without a dot, or one that belongs to a private network, is refused", () => {
  for (const raw of ["http://localhost/", "http://api/", "http://kokoro/v1", "https://hub.home/api/status", "https://jellyfin.HOME/", "http://printer.local/", "http://nas.lan/", "https://box.internal/", "https://thing.tailnet-name.ts.net/", "http://x.localhost/", "http://1.168.192.in-addr.arpa/", "http://something.onion/", "http://a.test/", "http://home/", "http://ts.net/"]) assert.deepEqual(addressOf(raw), { refused: privateName }, raw);
});

test("a name that only looks like a private one is let through", () => {
  for (const raw of ["https://homedepot.com/", "https://myhome.org/", "https://local.example.com/", "https://home.example.com/", "https://lan.party/"]) assert.ok("host" in addressOf(raw), raw);
});

test("every private, local, shared and reserved IPv4 range counts as private", () => {
  for (const address of ["0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.255", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.50", "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255"]) assert.equal(privateAddress(address), true, address);
});

test("public IPv4 addresses just outside those ranges don't count as private", () => {
  for (const address of ["1.1.1.1", "8.8.8.8", "9.255.255.255", "11.0.0.0", "100.63.255.255", "100.128.0.0", "126.255.255.255", "128.0.0.0", "169.253.255.255", "169.255.0.0", "172.15.255.255", "172.32.0.0", "192.167.255.255", "192.169.0.0", "192.0.1.1", "192.0.3.1", "198.17.255.255", "198.20.0.0", "198.51.99.1", "198.51.101.1", "203.0.112.1", "203.0.114.1", "223.255.255.255"]) assert.equal(privateAddress(address), false, address);
});

test("private, local and reserved IPv6 addresses count as private, including ones that wrap a private IPv4 address", () => {
  for (const address of ["::", "::1", "fc00::1", "fd12:3456:789a::1", "fe80::1", "fe80::1%eth0", "febf::1", "ff02::1", "2001:db8::1", "::ffff:192.168.0.1", "::ffff:c0a8:1", "::ffff:127.0.0.1", "::192.168.0.1", "::8.8.8.8", "::2", "0:0:0:0:0:1::", "64:ff9b::10.0.0.1", "64:ff9b::c0a8:1", "2002:c0a8:1::1", "2002:7f00:1::", "fec0::1", "fbff::1", "::ffff:0:192.168.0.1", "::ffff:0:8.8.8.8", "64:ff9b:1::8.8.8.8", "100::1", "2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:2::1", "2001:10::1", "2001:1ff:ffff::1", "3fff::1", "3fff:fff:ffff::1", "1::1", "1fff::1", "4000::1", "5f00::1", "e000::1"]) assert.equal(privateAddress(address), true, address);
});

test("public IPv6 addresses don't count as private, including ones that wrap a public IPv4 address", () => {
  for (const address of ["2606:4700:4700::1111", "2a00:1450:4009:81f::200e", "2001:4860:4860::8888", "::ffff:8.8.8.8", "::ffff:808:808", "64:ff9b::8.8.8.8", "2002:808:808::1", "2002:0808:0808::", "2001:db9::1", "2001:200::1", "2001:db7:ffff::1", "2000::1", "3ffe::1", "3fff:1000::1", "2620:fe::fe"]) assert.equal(privateAddress(address), false, address);
});

test("anything that isn't an IP address counts as private, so a strange answer from the resolver is refused", () => {
  for (const address of ["", "example.org", "1.2.3", "1.2.3.4.5", "256.1.1.1", ":::", "1::2::3", "12345::1", "g::1", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9"]) assert.equal(privateAddress(address), true, address);
});

test("a site's name for the log drops www and anything that isn't a web address", () => {
  assert.equal(siteOf("https://www.Example.org/a/b?c"), "example.org");
  assert.equal(siteOf("http://nodejs.org./"), "nodejs.org");
  assert.equal(siteOf("ftp://example.org/"), null);
  assert.equal(siteOf("nonsense"), null);
});

test("a name's twin is the same name with or without www, the one other name a redirect can reach without the guard being asked", () => {
  assert.deepEqual(twinsOf("example.org"), ["www.example.org"]);
  assert.deepEqual(twinsOf("www.example.org"), ["example.org"]);
  assert.deepEqual(twinsOf("docs.example.org"), ["www.docs.example.org"]);
  assert.deepEqual(twinsOf("www.www.example.org"), ["www.example.org"]);
  assert.deepEqual(twinsOf("wwwexample.org"), ["www.wwwexample.org"]);
});
