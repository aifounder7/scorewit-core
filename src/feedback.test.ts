import assert from "node:assert/strict";
import {
  renderAppHtml,
  type AppShellConfig,
  type FamilyConfig,
} from "./render/app";
import { feedbackScript, feedbackPage, FEEDBACK_COPY } from "./render/feedback";
import { legalSeoPages } from "./legal";
function shellConfig(family?: FamilyConfig): AppShellConfig {
  return {
    brand: {
      appName: "TestWit",
      appUrl: "https://example.test",
      markSvg: "<svg/>",
      themeColor: "#0C0C0E",
      // Full AA-passing palette — renderAppHtml gates contrast at build time.
      paletteCss: `    --bg:#0C0C0E; --elev:#161619; --surface:#222228; --hover:#2E2E36;
    --text:#EDEDEF; --text2:#9A9AA3; --text3:#84848D;
    --accent:#4E9CF5; --accentDim:rgba(78,156,245,0.14);
    --practice:#A78BFA; --practiceDim:rgba(167,139,250,0.14);
    --team:#5BC0CE; --teamDim:rgba(91,192,206,0.14);
    --today:#E879A6; --todayDim:rgba(232,121,166,0.14);
    --correct:#2ECC71; --correctDim:rgba(46,204,113,0.14);
    --incorrect:#EA4058; --incorrectDim:rgba(232,54,79,0.14);
    --partial:#F5A623;`,
      notFoundPaletteCss:
        "--bg:#0C0C0E;--text:#EDEDEF;--text2:#9A9AA3;--accent:#4E9CF5",
    },
    copy: {
      title: "t",
      metaDescription: "m",
      ogTitle: "o",
      ogDescription: "o",
      twitterTitle: "tw",
      twitterDescription: "tw",
      subInitial: "s",
      footerHtml: "<footer>No personal data, no cookies.</footer>",
      resultNote: "r",
      teamPickerBanner: "b",
      titleToday: "Today",
      titlePractice: "Practice",
      titleTeam: "My Team",
      notFoundHeading: "nf",
      notFoundBody: "nf",
      notFoundActionsHtml: '<a href="/">home</a>',
    },
    client: {
      consts: "// pack consts",
      decorations:
        "function teamLabel(n){return n;}function slLabel(s){return s;}",
      teamCards: 'function teamInsightsHtml(t){return "";}',
      todayCards:
        'function fixtureHtml(f){return "";}function pickRecordHtml(){return "";}',
    },
    config: { storagePrefix: "testwit", epochUtcArgs: "2026,0,1" },
    data: {
      bank: { seed: 1, questions: [] },
      teams: { teams: [] },
      matchday: { days: [] },
    },
    family,
  };
}

const config = {
  enabled: true,
  serviceUrl: "https://services.example",
  pack: "f1",
  appVersion: "0.22.0",
};
assert.equal(feedbackScript({ ...config, enabled: false }), "");
assert.equal(feedbackPage(), "");
assert.equal(
  renderAppHtml(shellConfig()),
  renderAppHtml({ ...shellConfig(), feedback: { ...config, enabled: false } }),
);
const script = feedbackScript(config);
new Function(script);
const enabled = renderAppHtml({ ...shellConfig(), feedback: config });
for (const text of [
  "scorewitFeedback.reaction",
  "scorewitFeedback.report",
  "scorewitFeedback.entry",
  "showModal",
  "keepalive:true",
  "sessionStorage",
  "What we send with this",
])
  assert.ok(enabled.includes(text), text);
assert.ok(!script.includes("localStorage"));
assert.ok(!script.includes("navigator.userAgent"));
assert.ok(!script.includes("Noted for tomorrow"));
assert.ok(!script.includes("scorewitFeedback=undefined"));
assert.equal(FEEDBACK_COPY.thanks, "Thanks.");
assert.equal(
  FEEDBACK_COPY.reportThanks,
  "Thanks. We check every report against the match record.",
);
for (const url of [
  "http://example.com",
  "https://a.example/path",
  "https://user:pass@a.example",
  "https://a.example?key=1",
])
  assert.throws(() => feedbackScript({ ...config, serviceUrl: url }));
assert.ok(!legalSeoPages()[0].bodyHtml.includes("<h2>Feedback</h2>"));
assert.ok(legalSeoPages(true)[0].bodyHtml.includes("<h2>Feedback</h2>"));
console.log(
  "feedback: disabled parity, valid generated JS, entry hooks, copy and private payload guards pass",
);
