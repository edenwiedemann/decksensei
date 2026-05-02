"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";

export default function SearchBar({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = new URLSearchParams(params?.toString() ?? "");
      const val = e.target.value.trim();
      if (val) {
        next.set("q", val);
      } else {
        next.delete("q");
      }
      next.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    },
    [router, pathname, params],
  );

  return (
    <Input
      type="search"
      placeholder="Buscar por email, cidade ou estado…"
      defaultValue={defaultValue}
      onChange={handleChange}
      className="max-w-sm"
    />
  );
}
