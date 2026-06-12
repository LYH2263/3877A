import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, invalid, ...props }, ref) => {
  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-10 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
        invalid
          ? "border-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.2)]"
          : "border-slate-300 shadow-[0_1px_2px_rgba(16,24,40,0.05)]",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
