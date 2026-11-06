import MarketModuleService from "siagrob1/services/MarketModuleService";

QUnit.module("MarketModuleService - sonda do módulo", {
  afterEach: function () {
    MarketModuleService.resetForTests();
  },
});

function stubFetch(responses: (() => Promise<{ status: number }>)[]): { calls: number } {
  const counter = { calls: 0 };
  (globalThis as { fetch: unknown }).fetch = () => {
    const next = responses[Math.min(counter.calls, responses.length - 1)];
    counter.calls++;
    return next();
  };
  return counter;
}

QUnit.test("depois de um estouro, não sonda de novo por 60 s (responde desligado provisório)", function (assert) {
  const done = assert.async();
  void (async (): Promise<void> => {
  let now = 1000;
  MarketModuleService.resetForTests(() => now);
  const counter = stubFetch([() => Promise.reject(new Error("AbortError")), () => Promise.resolve({ status: 200 })]);
  assert.strictEqual(await MarketModuleService.isEnabled(), false);
  assert.strictEqual(MarketModuleService.knownState(), undefined);
  now += 59999;
  assert.strictEqual(await MarketModuleService.isEnabled(), false);
  assert.strictEqual(counter.calls, 1, "sem nova sonda dentro dos 60 s");
  now += 1;
  assert.strictEqual(await MarketModuleService.isEnabled(), true);
  assert.strictEqual(counter.calls, 2);
  assert.strictEqual(MarketModuleService.knownState(), true);
  })().finally(done);
});

QUnit.test("404 é definitivo para a sessão", function (assert) {
  const done = assert.async();
  void (async (): Promise<void> => {
  MarketModuleService.resetForTests(() => 0);
  const counter = stubFetch([() => Promise.resolve({ status: 404 })]);
  assert.strictEqual(await MarketModuleService.isEnabled(), false);
  assert.strictEqual(await MarketModuleService.isEnabled(), false);
  assert.strictEqual(counter.calls, 1);
  assert.strictEqual(MarketModuleService.knownState(), false);
  })().finally(done);
});
