const edgeMarks = /^[`'"*_([{<]+|[`'"*_)\]}>.,;:!?]+$/g;

const wholeCodeSpan = /^[("'[]*`[^`]+`[)\]"'.,;:!?]*$/;

function isPath(word: string): boolean {
  const core = word.replace(edgeMarks, "");
  if (core.includes("\\")) return true;
  if (!core.includes("/") || /^[\d.,/]+$/.test(core)) return false;
  return core.includes("://") || /^(~|\.{1,2})?\//.test(core) || core.endsWith("/") || /\.[A-Za-z][A-Za-z0-9]{0,4}$/.test(core) || /^[^/]*\.[A-Za-z]{2,}(:\d+)?\//.test(core) || wholeCodeSpan.test(word);
}

function withoutPaths(text: string): string {
  return text
    .split(" ")
    .map((word) => {
      if (!isPath(word)) return word;
      const opening = /^[([]+/.exec(word)?.[0] ?? "";
      const closing = (/[`'")\]}>.,;:!?]+$/.exec(word)?.[0] ?? "").replace(/[`'"}>]/g, "");
      return opening + closing;
    })
    .join(" ");
}

export function speakable(piece: string): string {
  const text = withoutPaths(
    piece
      .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
      .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
      .replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1")
      .replace(/^\s*(>\s*)+/, "")
      .replace(/^\s*#{1,6}\s+/, "")
      .replace(/^\s*[-*+•]\s+(\[[ xX]\]\s+)?/, "")
      .replace(/^\s*(\d{1,3})[.)]\s+/, "$1, ")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<\/?[a-z][^>]*>/gi, " ")
      .replace(/ {2,}/g, " "),
  )
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{fe0f}\u{200d}\u{20e3}]/gu, "")
    .replace(/`+|~{2,}/g, "")
    .replace(/(?<![\p{L}\p{N}*])\*+(?=[^\s*])|(?<=[^\s*])\*+(?![\p{L}\p{N}*])|(?<=^\s*)\*+(?=\s)|(?<=\s)\*+(?=\s*$)/gu, "")
    .replace(/(?<=[\p{L}\p{N}])_+(?=[\p{L}\p{N}])/gu, " ")
    .replace(/_+/g, "")
    .replace(/\s*\|\s*/g, ", ")
    .replace(/([([])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1")
    .replace(/\(\)|\[\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:!?]+)(?= |$)/g, "$1")
    .replace(/^[\s,;:]+|[\s,]+$/g, "");
  return /[\p{L}\p{N}]/u.test(text) ? text : "";
}
