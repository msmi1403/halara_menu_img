import React, { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { checkPassword, setPassword } from '../geminiService';

// Team password screen. The password is checked by the server; the Gemini key
// never reaches the browser.
export const PasswordGate: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setChecking(true);
    setError('');
    if (await checkPassword(value)) {
      setPassword(value);
      onUnlock();
    } else {
      setError('That password did not work.');
    }
    setChecking(false);
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 text-center">
      <form onSubmit={submit} className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl border border-gray-100">
        <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Halara Menu Imagineer</h1>
        <p className="text-gray-500 mb-8 font-medium leading-relaxed">Enter the team password to make menu images.</p>
        <Input type="password" autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="Team password" />
        {error && <p className="text-red-600 text-sm font-semibold mt-3">{error}</p>}
        <Button type="submit" className="w-full py-4 text-lg mt-6" isLoading={checking} disabled={!value}>
          Sign in
        </Button>
      </form>
    </div>
  );
};
