"use client";

import { useEffect, useRef } from "react";
import { verifyAndLogin } from "../actions";

interface AutoVerifyProps {
  token: string;
}

export default function AutoVerify({ token }: AutoVerifyProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={verifyAndLogin} className="hidden">
      <input type="hidden" name="token" value={token} />
    </form>
  );
}
