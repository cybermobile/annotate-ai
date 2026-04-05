import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Zap,
  Globe,
  Loader2,
  Sparkles,
  ArrowRight,
  RectangleVertical,
  Palette,
} from "lucide-react";
import { Link } from "wouter";

const RATIOS = [
  { value: "3:4" as const, label: "3:4", desc: "Pinterest / Blog", w: 48, h: 64 },
  { value: "4:5" as const, label: "4:5", desc: "Instagram Feed", w: 52, h: 65 },
  { value: "9:16" as const, label: "9:16", desc: "Stories / Reels", w: 36, h: 64 },
];

function BrandBanner() {
  const { data: brand } = trpc.brand.get.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  if (!brand) return null;

  const isDefault = brand.accentColor === "#EC4899" && brand.bgColor === "#1A1A2E" && !brand.logoUrl && !brand.brandName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="mt-6 p-4 rounded-xl border border-border/50 bg-card/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Palette className="w-4 h-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {isDefault ? "Using default branding" : "Custom branding active"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {brand.brandName && (
                <span className="text-xs text-muted-foreground">{brand.brandName}</span>
              )}
              <div className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full border border-border/50"
                  style={{ backgroundColor: brand.accentColor }}
                  title={`Accent: ${brand.accentColor}`}
                />
                <div
                  className="w-3 h-3 rounded-full border border-border/50"
                  style={{ backgroundColor: brand.bgColor }}
                  title={`Background: ${brand.bgColor}`}
                />
                <div
                  className="w-3 h-3 rounded-full border border-border/50"
                  style={{ backgroundColor: brand.textColor }}
                  title={`Text: ${brand.textColor}`}
                />
              </div>
              {brand.logoUrl && (
                <img src={brand.logoUrl} alt="Logo" className="w-4 h-4 object-contain" />
              )}
            </div>
          </div>
        </div>
        <Link href="/brand">
          <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-primary/80">
            {isDefault ? "Customize" : "Edit"}
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}

export default function Generator() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [ratio, setRatio] = useState<"3:4" | "4:5" | "9:16">("4:5");
  const [isGenerating, setIsGenerating] = useState(false);

  const generateMutation = trpc.project.generate.useMutation({
    onSuccess: (data) => {
      toast.success("Generation started! Redirecting...");
      navigate(`/project/${data.projectId}`);
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(err.message || "Failed to start generation");
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(url.trim());
    } catch {
      toast.error("Please enter a valid URL (e.g. https://example.com)");
      return;
    }

    setIsGenerating(true);
    generateMutation.mutate({
      url: url.trim(),
      description: description.trim() || undefined,
      aspectRatio: ratio,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="container max-w-2xl pt-12 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-4">
              <Sparkles className="w-3 h-3" />
              New Generation
            </div>
            <h1 className="text-3xl font-bold mb-2">Generate Annotated Images</h1>
            <p className="text-muted-foreground">
              Paste a URL and we'll create annotated tutorial images ready for social media.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* URL Input */}
            <div className="space-y-2">
              <Label htmlFor="url" className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Website URL
              </Label>
              <div className="relative">
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/tutorial"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-12 pl-4 pr-4 bg-card border-border text-foreground placeholder:text-muted-foreground/50 text-base rounded-xl"
                  disabled={isGenerating}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Tutorial Description
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="e.g. How to set up Claude AI connectors step by step"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground/50 rounded-xl resize-none"
                rows={3}
                disabled={isGenerating}
              />
              <p className="text-xs text-muted-foreground">
                Describe what the tutorial is about. If left empty, we'll auto-detect from the page content.
              </p>
            </div>

            {/* Aspect Ratio Selector */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <RectangleVertical className="w-4 h-4 text-primary" />
                Aspect Ratio
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {RATIOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRatio(r.value)}
                    disabled={isGenerating}
                    className={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                      ratio === r.value
                        ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <div
                      className={`rounded-lg border-2 transition-colors ${
                        ratio === r.value ? "border-primary" : "border-muted"
                      }`}
                      style={{ width: r.w, height: r.h }}
                    />
                    <div className="text-center">
                      <div className={`text-sm font-bold ${ratio === r.value ? "text-primary" : "text-foreground"}`}>
                        {r.label}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.desc}</div>
                    </div>
                    {ratio === r.value && (
                      <motion.div
                        layoutId="ratio-indicator"
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      >
                        <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </motion.div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              size="lg"
              disabled={isGenerating || !url.trim()}
              className="w-full h-14 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 gap-2"
            >
              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Starting generation...
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    Generate Annotated Images
                    <ArrowRight className="w-4 h-4" />
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </form>

          {/* Brand Settings Banner */}
          <BrandBanner />

          {/* Info card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="mt-8 p-4 rounded-xl border border-border/50 bg-card/50"
          >
            <h3 className="text-sm font-semibold mb-2 text-foreground">What happens next?</h3>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>1. We scrape the URL for content, images, and metadata</p>
              <p>2. AI scores and selects the best images for your tutorial</p>
              <p>3. A carousel structure is planned (hook + steps + CTA)</p>
              <p>4. Screenshots are captured and annotated with badges, arrows, and highlights</p>
              <p>5. Vertical images are rendered and ready for download</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
