import type React from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "!w-auto !max-w-[90vw] !rounded-xl !border !border-slate-200 !bg-white !px-4 !py-3 !shadow-card",
          title: "!text-sm !font-medium",
          description: "!text-xs !text-slate-500"
        }
      }}
      offset={52}
      {...props}
    />
  );
};

export { Toaster };
