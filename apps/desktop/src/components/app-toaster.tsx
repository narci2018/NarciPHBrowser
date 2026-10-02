import { Toaster } from "sonner";
import { useTheme } from "./theme-provider";

export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      closeButton
      richColors
    />
  );
}
