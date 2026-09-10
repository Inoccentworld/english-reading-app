type GeminiErrorDetails = {
  status: number;
  code: string;
  message: string;
};

const DEFAULT_STATUS = 500;

export const GEMINI_REQUEST_TIMEOUT_MS = 60_000;

export function getGeminiErrorDetails(error: unknown): GeminiErrorDetails {
  const apiStatus =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const normalizedMessage = rawMessage.toLowerCase();

  if (apiStatus === 429) {
    const isDailyLimit =
      normalizedMessage.includes("perday") ||
      normalizedMessage.includes("per day") ||
      normalizedMessage.includes("requests per day") ||
      normalizedMessage.includes("free_tier_requests");

    return isDailyLimit
      ? {
          status: 429,
          code: "DAILY_QUOTA_EXCEEDED",
          message:
            "Gemini APIの1日の利用上限に達しました（429）。上限がリセットされてから再試行してください。",
        }
      : {
          status: 429,
          code: "RATE_LIMITED",
          message:
            "Gemini APIへのリクエストが集中しています（429）。しばらく待ってから再試行してください。",
        };
  }

  if (apiStatus === 401 || apiStatus === 403) {
    return {
      status: apiStatus,
      code: "AUTHENTICATION_ERROR",
      message: `Gemini APIキーが無効か、利用権限がありません（${apiStatus}）。設定を確認してください。`,
    };
  }

  if (apiStatus === 400) {
    return {
      status: 400,
      code: "INVALID_REQUEST",
      message:
        "Gemini APIへ送信した内容を処理できませんでした（400）。入力内容を確認してください。",
    };
  }

  if (apiStatus === 404) {
    return {
      status: 404,
      code: "MODEL_NOT_FOUND",
      message:
        "指定されたGeminiモデルを利用できません（404）。モデルの設定を確認してください。",
    };
  }

  if (
    apiStatus === 408 ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("etimedout")
  ) {
    return {
      status: 504,
      code: "TIMEOUT",
      message:
        "Gemini APIからの応答がタイムアウトしました。通信状況を確認して再試行してください。",
    };
  }

  if (apiStatus !== undefined && apiStatus >= 500) {
    return {
      status: 502,
      code: "GEMINI_SERVICE_ERROR",
      message: `Gemini APIで一時的な障害が発生しています（${apiStatus}）。しばらく待ってから再試行してください。`,
    };
  }

  if (
    error instanceof SyntaxError ||
    normalizedMessage.includes("generated phonetic tokens do not match")
  ) {
    return {
      status: 502,
      code: "INVALID_RESPONSE",
      message:
        "AIから正しい形式の応答を取得できませんでした。再試行してください。",
    };
  }

  if (
    error instanceof TypeError ||
    normalizedMessage.includes("fetch failed") ||
    normalizedMessage.includes("econnreset") ||
    normalizedMessage.includes("enotfound")
  ) {
    return {
      status: 503,
      code: "NETWORK_ERROR",
      message:
        "Gemini APIに接続できませんでした。通信状況を確認して再試行してください。",
    };
  }

  return {
    status: DEFAULT_STATUS,
    code: "UNKNOWN_ERROR",
    message: "AIの処理中に予期しないエラーが発生しました。再試行してください。",
  };
}
