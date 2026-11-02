class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

function uintId(value, name = "entryId", allowZero = false) {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) {
    throw new AppError(400, "INVALID_ID", name + " must be a decimal integer");
  }
  const number = BigInt(value);
  if ((!allowZero && number === 0n) || number >= 2n ** 256n) {
    throw new AppError(400, "INVALID_ID", name + " is outside the supported range");
  }
  return number.toString();
}

function pageNumber(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d{1,8}$/.test(value)) {
    throw new AppError(400, "INVALID_PAGE", "Pagination values must be nonnegative integers");
  }
  const number = Number(value);
  if (number > maximum) throw new AppError(400, "INVALID_PAGE", "Pagination value is too large");
  return number;
}

function githubUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new AppError(400, "INVALID_REPOSITORY", "A GitHub repository URL is required");
  }
  let url;
  try { url = new URL(value.trim()); } catch {
    throw new AppError(400, "INVALID_REPOSITORY", "Enter https://github.com/owner/repository");
  }
  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)\/?$/.exec(url.pathname);
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "github.com" ||
      url.username || url.password || url.port || url.search || url.hash || !match) {
    throw new AppError(400, "INVALID_REPOSITORY", "Enter https://github.com/owner/repository");
  }
  const repository = match[2].replace(/\.git$/, "");
  if (!repository || [".", ".."].includes(repository) || [".", ".."].includes(match[1])) {
    throw new AppError(400, "INVALID_REPOSITORY", "Invalid GitHub repository path");
  }
  return "https://github.com/" + match[1] + "/" + repository;
}

module.exports = { AppError, uintId, pageNumber, githubUrl };
