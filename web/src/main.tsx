import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n/context";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 用量数据变化快，但窗口聚焦重拉在管理中心 iframe 里太频繁
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <App />
            <Toaster position="top-center" />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
