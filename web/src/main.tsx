import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { LazyMotion, MotionConfig, domAnimation } from "motion/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <App />
        <Toaster position="top-right" richColors />
      </TooltipProvider>
    </MotionConfig>
    </LazyMotion>
  </StrictMode>,
)
