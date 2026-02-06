"use client"

import * as React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import { Minus, Plus, Type, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type FontSize = "normal" | "large" | "xlarge"
type Contrast = "normal" | "high"

interface AccessibilityContextType {
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
  contrast: Contrast
  setContrast: (contrast: Contrast) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined)

export function useAccessibility() {
  const context = useContext(AccessibilityContext)
  if (!context) {
    throw new Error("useAccessibility must be used within AccessibilityProvider")
  }
  return context
}

const FONT_SIZE_MAP: Record<FontSize, string> = {
  normal: "100%",
  large: "118%",
  xlarge: "135%",
}

const FONT_SIZES: FontSize[] = ["normal", "large", "xlarge"]

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSize] = useState<FontSize>("normal")
  const [contrast, setContrast] = useState<Contrast>("normal")
  const [mounted, setMounted] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true)
    const savedFontSize = localStorage.getItem("a11y-font-size") as FontSize
    const savedContrast = localStorage.getItem("a11y-contrast") as Contrast
    if (savedFontSize && FONT_SIZES.includes(savedFontSize)) {
      setFontSize(savedFontSize)
    }
    if (savedContrast && ["normal", "high"].includes(savedContrast)) {
      setContrast(savedContrast)
    }
  }, [])

  // Apply to document
  useEffect(() => {
    if (!mounted) return
    document.documentElement.style.fontSize = FONT_SIZE_MAP[fontSize]
    localStorage.setItem("a11y-font-size", fontSize)
  }, [fontSize, mounted])

  useEffect(() => {
    if (!mounted) return
    if (contrast === "high") {
      document.documentElement.classList.add("high-contrast")
    } else {
      document.documentElement.classList.remove("high-contrast")
    }
    localStorage.setItem("a11y-contrast", contrast)
  }, [contrast, mounted])

  const increaseFontSize = () => {
    const currentIndex = FONT_SIZES.indexOf(fontSize)
    if (currentIndex < FONT_SIZES.length - 1) {
      setFontSize(FONT_SIZES[currentIndex + 1])
    }
  }

  const decreaseFontSize = () => {
    const currentIndex = FONT_SIZES.indexOf(fontSize)
    if (currentIndex > 0) {
      setFontSize(FONT_SIZES[currentIndex - 1])
    }
  }

  return (
    <AccessibilityContext.Provider
      value={{ fontSize, setFontSize, contrast, setContrast, increaseFontSize, decreaseFontSize }}
    >
      {children}
    </AccessibilityContext.Provider>
  )
}

// Floating accessibility controls
export function AccessibilityControls() {
  const { fontSize, increaseFontSize, decreaseFontSize, contrast, setContrast } = useAccessibility()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed bottom-20 right-4 z-50">
      {isOpen && (
        <div className="mb-2 bg-white rounded-2xl shadow-xl border border-primary/20 p-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="space-y-3">
            {/* Font size controls */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Type className="h-3 w-3" />
                Mărime text
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="soft"
                  size="iconSm"
                  onClick={decreaseFontSize}
                  disabled={fontSize === "normal"}
                  aria-label="Micșorează textul"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold min-w-[60px] text-center text-primary">
                  {fontSize === "normal" ? "Normal" : fontSize === "large" ? "Mare" : "F. Mare"}
                </span>
                <Button
                  variant="soft"
                  size="iconSm"
                  onClick={increaseFontSize}
                  disabled={fontSize === "xlarge"}
                  aria-label="Mărește textul"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Contrast toggle */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Eye className="h-3 w-3" />
                Contrast
              </p>
              <Button
                variant={contrast === "high" ? "default" : "soft"}
                onClick={() => setContrast(contrast === "high" ? "normal" : "high")}
                size="sm"
                className="w-full"
              >
                {contrast === "high" ? "Contrast ridicat ✓" : "Contrast normal"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="iconLg"
        variant={isOpen ? "default" : "outline"}
        className="rounded-full shadow-xl"
        aria-label="Opțiuni accesibilitate"
      >
        <Type className="h-5 w-5" />
      </Button>
    </div>
  )
}
