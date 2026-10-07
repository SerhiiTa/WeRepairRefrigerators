import assert from "node:assert/strict";

import { normalizeTranscriptForDisplay } from "./transcript-normalization.ts";

const cases = [
  {
    name: "ZIP spoken digits",
    input: "my zip code is seven seven four five zero",
    includes: "77450",
  },
  {
    name: "ZIP already normalized",
    input: "my zip code is 77450",
    expected: "my zip code is 77450",
  },
  {
    name: "phone spoken digits",
    input: "my phone number is three four six three eight one eight zero nine four",
    includes: "(346) 381-8094",
  },
  {
    name: "phone already normalized",
    input: "my phone number is (346) 381-8094",
    expected: "my phone number is (346) 381-8094",
  },
  {
    name: "street number",
    input: "my address is three three zero six South Fry Road",
    includes: "3306 South Fry Road",
  },
  {
    name: "ambiguous street",
    input: "my address is 330XY Road",
    expected: "my address is 330XY Road",
  },
  {
    name: "apartment leading zero",
    input: "apartment zero four three seven",
    includes: "apartment 0437",
  },
  {
    name: "unit",
    input: "unit one zero two",
    includes: "unit 102",
  },
  {
    name: "time with explicit morning",
    input: "tomorrow from eight to ten in the morning",
    includes: ["8:00 AM", "10:00 AM"],
  },
  {
    name: "time without am pm",
    input: "tomorrow from eight to ten",
    expected: "tomorrow from eight to ten",
  },
  {
    name: "date",
    input: "October seventh",
    includes: "October 7",
  },
  {
    name: "compound date",
    input: "October twenty seventh",
    includes: "October 27",
  },
  {
    name: "relative date",
    input: "tomorrow morning",
    expected: "tomorrow morning",
  },
  {
    name: "ordinary count",
    input: "I have three refrigerators",
    expected: "I have three refrigerators",
  },
  {
    name: "ordinary duration",
    input: "it stopped working three days ago",
    expected: "it stopped working three days ago",
  },
];

for (const testCase of cases) {
  const actual = normalizeTranscriptForDisplay(testCase.input);
  if ("expected" in testCase) {
    assert.equal(actual, testCase.expected, testCase.name);
  }
  if ("includes" in testCase) {
    const expectations = Array.isArray(testCase.includes)
      ? testCase.includes
      : [testCase.includes];
    for (const expectedPart of expectations) {
      assert.match(actual, new RegExp(expectedPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), testCase.name);
    }
  }
}

const once = normalizeTranscriptForDisplay("apartment zero four three seven");
assert.equal(normalizeTranscriptForDisplay(once), once, "normalization is idempotent");

console.log("transcript-normalization tests passed");
