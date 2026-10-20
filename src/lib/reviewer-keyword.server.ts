/** Server-only. Set REVIEWER_SIGNUP_KEYWORD in the host environment. */
export function reviewerSignupKeyword() {
  const keyword = process.env.REVIEWER_SIGNUP_KEYWORD?.trim();
  if (!keyword) throw new Error("Reviewer signup is not configured");
  return keyword;
}
