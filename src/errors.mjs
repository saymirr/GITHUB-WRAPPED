/**
 * An expected, user-facing failure (bad input, unknown user, rate limit...).
 * The CLI prints `message` (and `hint`, if any) without a stack trace.
 */
export class WrappedError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, hint?: string }} [options]
   */
  constructor(message, { code = 'ERROR', hint } = {}) {
    super(message);
    this.name = 'WrappedError';
    this.code = code;
    this.hint = hint;
  }
}
