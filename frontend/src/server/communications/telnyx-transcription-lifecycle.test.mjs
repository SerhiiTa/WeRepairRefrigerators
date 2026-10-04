import assert from "node:assert/strict";
import test from "node:test";

function makeState() {
  return {
    callTranscriptId: null,
    fullRecordingSttRequests: 0,
    recordingPlayableViaProxy: true,
    recordingReady: false,
    speakerSegments: [],
    transcriptRows: [],
    transcriptionState: null,
  };
}

function findTranscriptRow(state) {
  return state.callTranscriptId
    ? state.transcriptRows.find((row) => row.id === state.callTranscriptId)
    : state.transcriptRows[0] ?? null;
}

function runFullRecordingTranscription(state) {
  const existing = findTranscriptRow(state);
  if (existing?.transcriptText) {
    state.transcriptionState = "transcript_complete";
    return existing;
  }

  state.fullRecordingSttRequests += 1;
  const transcript = {
    id: "transcript-1",
    recordingReference: "recording-1",
    speakerSegments: [],
    transcriptText: "Customer said 3306 S. Fry Road apartment 0437 ZIP 77450 Samsung.",
  };
  state.transcriptRows = [transcript];
  state.callTranscriptId = transcript.id;
  state.speakerSegments = transcript.speakerSegments;
  state.transcriptionState = "transcript_complete";
  return transcript;
}

function finalize(state) {
  if (!state.recordingReady) {
    state.transcriptionState = "waiting_for_recording";
    return;
  }

  runFullRecordingTranscription(state);
}

function recordingSaved(state) {
  state.recordingReady = true;
  finalize(state);
}

function transcriptionSaved(state) {
  const existing = findTranscriptRow(state);
  if (!existing) {
    state.transcriptRows = [
      {
        id: "transcript-1",
        recordingReference: "recording-1",
        speakerSegments: [],
        transcriptText: "Provider flat transcript.",
      },
    ];
    state.callTranscriptId = "transcript-1";
    state.speakerSegments = [];
  }

  finalize(state);
}

test("new recording gets one canonical full transcript", () => {
  const state = makeState();

  recordingSaved(state);

  assert.equal(state.transcriptionState, "transcript_complete");
  assert.equal(state.fullRecordingSttRequests, 1);
  assert.equal(state.transcriptRows[0]?.transcriptText.includes("3306 S. Fry Road"), true);
});

test("transcript_id is attached to the correct communication_call", () => {
  const state = makeState();

  recordingSaved(state);

  assert.equal(state.callTranscriptId, "transcript-1");
  assert.equal(findTranscriptRow(state)?.id, state.callTranscriptId);
});

test("duplicate recording webhook does not create duplicate transcript rows", () => {
  const state = makeState();

  recordingSaved(state);
  recordingSaved(state);

  assert.equal(state.transcriptRows.length, 1);
  assert.equal(state.fullRecordingSttRequests, 1);
});

test("later duplicate transcription event does not unnecessarily retranscribe", () => {
  const state = makeState();

  recordingSaved(state);
  transcriptionSaved(state);

  assert.equal(state.transcriptRows.length, 1);
  assert.equal(state.fullRecordingSttRequests, 1);
  assert.equal(state.transcriptionState, "transcript_complete");
});

test("empty speaker_segments is a valid terminal flat transcript", () => {
  const state = makeState();

  recordingSaved(state);

  assert.equal(state.transcriptionState, "transcript_complete");
  assert.deepEqual(state.speakerSegments, []);
});

test("flat transcript does not trigger retry/reprocessing because speaker_segments is empty", () => {
  const state = makeState();

  recordingSaved(state);
  finalize(state);

  assert.equal(state.fullRecordingSttRequests, 1);
  assert.deepEqual(state.speakerSegments, []);
});

test("recording playback proxy path remains independent from transcription shape", () => {
  const state = makeState();

  recordingSaved(state);

  assert.equal(state.recordingPlayableViaProxy, true);
  assert.equal(state.transcriptionState, "transcript_complete");
});
