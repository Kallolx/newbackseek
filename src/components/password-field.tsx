'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';

/** Password input with an eye button that shows or hides the text. Same markup everywhere (public + admin). */
export function PasswordField(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return <span className="password-field">
    <input {...props} type={visible ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    <button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
      {visible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
    </button>
  </span>;
}
