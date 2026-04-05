import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Navbar from "@/components/Navbar";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  Image as ImageIcon,
  Package,
  ArrowLeft,
  ExternalLink,
  Maximize2,
} from "lucide-react";

export default function ProjectView() {
  const [, params] = useRoute("/project/:id");
  const projectId = params?.id ? parseInt(params.id, 10) : 0;
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Poll project status
  const statusQuery = trpc.project.status.useQuery(
    { projectId },
    {
      enabled: !!projectId && isAuthenticated,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 2000; // poll every 2s while generating
      },
    }
  );

  const project = statusQuery.data;
  const images = useMemo(() => project?.images || [], [project?.images]);
  const isProcessing = project && !["completed", "failed"].includes(project.status);
  const isCompleted = project?.status === "completed";
  const isFailed = project?.status === "failed";

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  // Reset slide index when images change
  useEffect(() => {
    if (images.length > 0 && currentSlide >= images.length) {
      setCurrentSlide(0);
    }
  }, [images.length, currentSlide]);

  const nextSlide = () => {
    if (images.length > 0) {
      setCurrentSlide((prev) => (prev + 1) % images.length);
    }
  };

  const prevSlide = () => {
    if (images.length > 0) {
      setCurrentSlide((prev) => (prev - 1 + images.length) % images.length);
    }
  };

  const handleDownloadZip = () => {
    if (!projectId) return;
    const link = document.createElement("a");
    link.href = `/api/download-zip/${projectId}`;
    link.download = `annotated-images-${projectId}.zip`;
    link.click();
    toast.success("Downloading ZIP...");
  };

  const handleDownloadSingle = (imageUrl: string, index: number) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `slide-${index + 1}.png`;
    link.target = "_blank";
    link.click();
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

      <div className="container max-w-5xl pt-8 pb-20">
        {/* Back button */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </motion.div>

        {/* Project header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold mb-1 truncate">
                {project?.title || "Generating..."}
              </h1>
              {project?.url && (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {project.url.replace(/^https?:\/\//, "").slice(0, 60)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              {project?.aspectRatio && (
                <span className="px-2.5 py-1 rounded-lg bg-card border border-border text-xs font-medium text-muted-foreground">
                  {project.aspectRatio}
                </span>
              )}
              <StatusBadge status={project?.status || "pending"} />
            </div>
          </div>
        </motion.div>

        {/* Processing state */}
        <AnimatePresence mode="wait">
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-8"
            >
              <div className="p-6 rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Processing</h3>
                    <p className="text-xs text-muted-foreground">
                      {project?.statusMessage || "Starting pipeline..."}
                    </p>
                  </div>
                </div>
                <Progress
                  value={getProgressValue(project?.status || "pending")}
                  className="h-2"
                />
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {["scraping", "analyzing", "generating", "completed"].map((step) => (
                    <div
                      key={step}
                      className={`text-center text-xs py-1.5 rounded-lg transition-colors ${
                        getStepState(project?.status || "pending", step) === "active"
                          ? "bg-primary/10 text-primary font-medium"
                          : getStepState(project?.status || "pending", step) === "done"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {step.charAt(0).toUpperCase() + step.slice(1)}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Failed state */}
          {isFailed && (
            <motion.div
              key="failed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-8"
            >
              <div className="p-6 rounded-2xl border border-red-500/30 bg-red-500/5">
                <div className="flex items-center gap-3">
                  <XCircle className="w-6 h-6 text-red-400" />
                  <div>
                    <h3 className="font-semibold text-sm text-red-400">Generation Failed</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {project?.statusMessage || "An error occurred during generation."}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => navigate("/generate")}
                >
                  Try Again
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image carousel */}
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {/* Completed banner */}
            {isCompleted && (
              <div className="flex items-center gap-3 mb-6 p-4 rounded-xl border border-green-500/30 bg-green-500/5">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="text-sm font-medium text-green-400">
                  {images.length} annotated images generated successfully
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadZip}
                    className="gap-1.5"
                  >
                    <Package className="w-3.5 h-3.5" />
                    Download ZIP
                  </Button>
                </div>
              </div>
            )}

            {/* Main carousel viewer */}
            <div className="relative">
              <div className="flex gap-6">
                {/* Main image */}
                <div className="flex-1">
                  <div className="relative rounded-2xl overflow-hidden border border-border bg-card group">
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={currentSlide}
                        src={images[currentSlide]?.imageUrl}
                        alt={`Slide ${currentSlide + 1}`}
                        className="w-full h-auto"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                      />
                    </AnimatePresence>

                    {/* Navigation arrows */}
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={prevSlide}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={nextSlide}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}

                    {/* Expand button */}
                    <button
                      onClick={() => setLightboxOpen(true)}
                      className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>

                    {/* Slide counter */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-medium">
                      {currentSlide + 1} / {images.length}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      {currentSlide === 0
                        ? "Hook / Title"
                        : currentSlide === images.length - 1
                        ? "Recap / CTA"
                        : `Step ${images[currentSlide]?.stepNumber || currentSlide}`}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDownloadSingle(
                          images[currentSlide]?.imageUrl,
                          currentSlide
                        )
                      }
                      className="gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </Button>
                  </div>
                </div>

                {/* Thumbnail strip (side panel) */}
                {images.length > 1 && (
                  <div className="hidden lg:flex flex-col gap-2 w-24 max-h-[700px] overflow-y-auto pr-1">
                    {images.map((img, i) => (
                      <button
                        key={img.id}
                        onClick={() => setCurrentSlide(i)}
                        className={`relative rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                          i === currentSlide
                            ? "border-primary shadow-lg shadow-primary/20"
                            : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={img.imageUrl}
                          alt={`Thumb ${i + 1}`}
                          className="w-full h-auto"
                          loading="lazy"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 font-medium">
                          {i === 0 ? "Hook" : i === images.length - 1 ? "CTA" : `${i}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile thumbnail dots */}
              {images.length > 1 && (
                <div className="flex lg:hidden items-center justify-center gap-1.5 mt-4">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === currentSlide
                          ? "bg-primary w-6"
                          : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Empty state while loading */}
        {!project && !statusQuery.isLoading && (
          <div className="text-center py-20">
            <ImageIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Project not found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This project may have been deleted or you don't have access.
            </p>
            <Button variant="outline" onClick={() => navigate("/generate")}>
              Create New Project
            </Button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && images.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <motion.img
              key={currentSlide}
              src={images[currentSlide]?.imageUrl}
              alt={`Slide ${currentSlide + 1}`}
              className="max-w-full max-h-full object-contain rounded-lg"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); prevSlide(); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); nextSlide(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Pending" },
    scraping: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Scraping" },
    scoring: { bg: "bg-indigo-500/20", text: "text-indigo-400", label: "Scoring" },
    analyzing: { bg: "bg-purple-500/20", text: "text-purple-400", label: "Analyzing" },
    generating: { bg: "bg-primary/20", text: "text-primary", label: "Generating" },
    completed: { bg: "bg-green-500/20", text: "text-green-400", label: "Completed" },
    failed: { bg: "bg-red-500/20", text: "text-red-400", label: "Failed" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function getProgressValue(status: string): number {
  const map: Record<string, number> = {
    pending: 5,
    scraping: 20,
    scoring: 35,
    analyzing: 50,
    generating: 75,
    completed: 100,
    failed: 0,
  };
  return map[status] || 0;
}

function getStepState(currentStatus: string, step: string): "pending" | "active" | "done" {
  const order = ["scraping", "analyzing", "generating", "completed"];
  const currentIdx = order.indexOf(currentStatus);
  const stepIdx = order.indexOf(step);

  if (currentIdx < 0) return "pending";
  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}
