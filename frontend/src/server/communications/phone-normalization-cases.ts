import {
  normalizePhoneWorkflowPayload,
  type NormalizedPhoneWorkflow,
} from "./phone-normalization";

type PhoneNormalizationExpected = {
  serviceAddress?: string | null;
  serviceUnit?: string | null;
  serviceCity?: string | null;
  appointmentDate?: string | null;
  windowStartTime?: string | null;
  windowEndTime?: string | null;
};

export type PhoneNormalizationCase = {
  name: string;
  payload: unknown;
  expected: PhoneNormalizationExpected;
};

const RETELL_CALL_START = "2026-07-05T15:00:00.000Z";

export const phoneNormalizationCases: PhoneNormalizationCase[] = [
  {
    name: "Retell comma address with apartment and city",
    payload: {
      call: {
        call_id: "case-address-unit-city",
        from_number: "+17135550100",
        to_number: "+13466461949",
        start_timestamp: RETELL_CALL_START,
        call_analysis: {
          custom_analysis_data: {
            address: "3306 South Fry Road, apartment 437, Katy",
          },
        },
      },
    },
    expected: {
      serviceAddress: "3306 South Fry Road",
      serviceUnit: "apartment 437",
      serviceCity: "Katy",
    },
  },
  {
    name: "Retell tomorrow uses call start date in Central time",
    payload: {
      call: {
        call_id: "case-tomorrow-central",
        from_number: "+17135550101",
        to_number: "+13466461949",
        start_timestamp: RETELL_CALL_START,
        call_analysis: {
          custom_analysis_data: {
            appointment_date: "tomorrow",
          },
        },
      },
    },
    expected: {
      appointmentDate: "2026-07-06",
    },
  },
  {
    name: "Retell 9 to 11 AM window",
    payload: {
      call: {
        call_id: "case-window-9-to-11",
        from_number: "+17135550102",
        to_number: "+13466461949",
        start_timestamp: RETELL_CALL_START,
        call_analysis: {
          custom_analysis_data: {
            appointment_time: "9 to 11 AM",
          },
        },
      },
    },
    expected: {
      windowStartTime: "09:00:00",
      windowEndTime: "11:00:00",
    },
  },
  {
    name: "Retell morning between 9 and 11 window",
    payload: {
      call: {
        call_id: "case-window-between",
        from_number: "+17135550103",
        to_number: "+13466461949",
        start_timestamp: RETELL_CALL_START,
        call_analysis: {
          custom_analysis_data: {
            appointment_time: "tomorrow morning between 9 and 11",
          },
        },
      },
    },
    expected: {
      windowStartTime: "09:00:00",
      windowEndTime: "11:00:00",
    },
  },
  {
    name: "Retell dash window",
    payload: {
      call: {
        call_id: "case-window-dash",
        from_number: "+17135550104",
        to_number: "+13466461949",
        start_timestamp: RETELL_CALL_START,
        call_analysis: {
          custom_analysis_data: {
            appointment_time: "9-11 AM",
          },
        },
      },
    },
    expected: {
      windowStartTime: "09:00:00",
      windowEndTime: "11:00:00",
    },
  },
];

export function runPhoneNormalizationCases(): Array<{
  name: string;
  passed: boolean;
  normalized: Pick<
    NormalizedPhoneWorkflow,
    | "serviceAddress"
    | "serviceUnit"
    | "serviceCity"
    | "appointmentDate"
    | "windowStartTime"
    | "windowEndTime"
  >;
  expected: PhoneNormalizationExpected;
}> {
  return phoneNormalizationCases.map((testCase) => {
    const normalized = normalizePhoneWorkflowPayload("retell", testCase.payload);
    const relevant = {
      serviceAddress: normalized.serviceAddress,
      serviceUnit: normalized.serviceUnit,
      serviceCity: normalized.serviceCity,
      appointmentDate: normalized.appointmentDate,
      windowStartTime: normalized.windowStartTime,
      windowEndTime: normalized.windowEndTime,
    };

    return {
      name: testCase.name,
      passed: Object.entries(testCase.expected).every(
        ([key, expectedValue]) =>
          relevant[key as keyof typeof relevant] === expectedValue,
      ),
      normalized: relevant,
      expected: testCase.expected,
    };
  });
}
