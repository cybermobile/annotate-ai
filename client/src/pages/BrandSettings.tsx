import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Navbar from "@/components/Navbar";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Palette,
  Upload,
  Trash2,
  Save,
  Eye,
  ArrowLeft,
  Loader2,
  CheckCircle,
  Type,
  ImageIcon,
} from "lucide-react";
import { Link } from "wouter";

const PRESET_COLORS = [
  { name: "Pink", accent: "#EC4899", bg: "#111111", text: "#FFFFFF" },
  { name: "Blue", accent: "#3B82F6", bg: "#0F172A", text: "#F8FAFC" },
  { name: "Green", accent: "#10B981", bg: "#0A1A14", text: "#F0FDF4" },
  { name: "Purple", accent: "#8B5CF6", bg: "#1A0F2E", text: "#F5F3FF" },
  { name: "Orange", accent: "#F97316", bg: "#1A0F00", text: "#FFF7ED" },
  { name: "Red", accent: "#EF4444", bg: "#1A0505", text: "#FEF2F2" },
  { name: "Cyan", accent: "#06B6D4", bg: "#0A1A1E", text: "#ECFEFF" },
  { name: "Yellow", accent: "#EAB308", bg: "#1A1700", text: "#FEFCE8" },
];

export default function BrandSettings() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { data: brandData, isLoading: brandLoading } = trpc.brand.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const updateMutation = trpc.brand.update.useMutation();
  const uploadLogoMutation = trpc.brand.uploadLogo.useMutation();
  const removeLogoMutation = trpc.brand.removeLogo.useMutation();
  const utils = trpc.useUtils();

  const [brandName, setBrandName] = useState("");
  const [accentColor, setAccentColor] = useState("#EC4899");
  const [bgColor, setBgColor] = useState("#111111");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state from server data
  useEffect(() => {
    if (brandData) {
      setBrandName(brandData.brandName || "");
      setAccentColor(brandData.accentColor);
      setBgColor(brandData.bgColor);
      setTextColor(brandData.textColor);
      setLogoPreview(brandData.logoUrl || null);
      setHasChanges(false);
    }
  }, [brandData]);

  const markChanged = useCallback(() => setHasChanges(true), []);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        brandName: brandName || null,
        accentColor,
        bgColor,
        textColor,
      });
      utils.brand.get.invalidate();
      setHasChanges(false);
      toast.success("Brand settings saved!");
    } catch (err) {
      toast.error("Failed to save brand settings");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be under 5MB");
      return;
    }

    if (!file.type.match(/^image\/(png|jpeg|jpg|svg\+xml|webp)$/)) {
      toast.error("Please upload a PNG, JPG, SVG, or WebP image");
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      const result = await uploadLogoMutation.mutateAsync({
        base64,
        mimeType: file.type,
        fileName: file.name,
      });
      setLogoPreview(result.logoUrl);
      utils.brand.get.invalidate();
      toast.success("Logo uploaded!");
    } catch (err) {
      toast.error("Failed to upload logo");
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await removeLogoMutation.mutateAsync();
      setLogoPreview(null);
      utils.brand.get.invalidate();
      toast.success("Logo removed");
    } catch (err) {
      toast.error("Failed to remove logo");
    }
  };

  if (authLoading || brandLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-muted-foreground">Sign in to manage your brand settings</p>
          <a href="/login">
            <Button>Sign In</Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-6xl py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/generate">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Brand Settings</h1>
            <p className="text-muted-foreground mt-1">
              Customize the look of your generated carousels
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Settings */}
          <div className="space-y-6">
            {/* Brand Name */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Type className="w-5 h-5 text-primary" />
                  Brand Name
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder="Your Brand Name (optional)"
                  value={brandName}
                  onChange={(e) => {
                    setBrandName(e.target.value);
                    markChanged();
                  }}
                  className="bg-background border-border"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Displayed on hook and CTA slides as a watermark
                </p>
              </CardContent>
            </Card>

            {/* Logo Upload */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ImageIcon className="w-5 h-5 text-primary" />
                  Logo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative w-20 h-20 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden"
                    >
                      <img
                        src={logoPreview}
                        alt="Brand logo"
                        className="max-w-full max-h-full object-contain p-2"
                      />
                    </motion.div>
                  ) : (
                    <div className="w-20 h-20 rounded-lg border border-dashed border-border bg-background flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadLogoMutation.isPending}
                    >
                      {uploadLogoMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {logoPreview ? "Replace" : "Upload"} Logo
                    </Button>
                    {logoPreview && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        disabled={removeLogoMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  PNG, JPG, SVG, or WebP. Max 5MB. Displayed in the corner of each slide.
                </p>
              </CardContent>
            </Card>

            {/* Color Settings */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Palette className="w-5 h-5 text-primary" />
                  Colors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Accent Color */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Accent Color</Label>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => {
                          setAccentColor(e.target.value);
                          markChanged();
                        }}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent"
                      />
                    </div>
                    <Input
                      value={accentColor}
                      onChange={(e) => {
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                          setAccentColor(e.target.value);
                          markChanged();
                        }
                      }}
                      className="w-28 font-mono text-sm bg-background border-border"
                    />
                    <span className="text-xs text-muted-foreground">Badges, arrows, highlights</span>
                  </div>
                </div>

                {/* Background Color */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Background Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => {
                        setBgColor(e.target.value);
                        markChanged();
                      }}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent"
                    />
                    <Input
                      value={bgColor}
                      onChange={(e) => {
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                          setBgColor(e.target.value);
                          markChanged();
                        }
                      }}
                      className="w-28 font-mono text-sm bg-background border-border"
                    />
                    <span className="text-xs text-muted-foreground">Slide background</span>
                  </div>
                </div>

                {/* Text Color */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Text Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => {
                        setTextColor(e.target.value);
                        markChanged();
                      }}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent"
                    />
                    <Input
                      value={textColor}
                      onChange={(e) => {
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                          setTextColor(e.target.value);
                          markChanged();
                        }
                      }}
                      className="w-28 font-mono text-sm bg-background border-border"
                    />
                    <span className="text-xs text-muted-foreground">Headings, labels</span>
                  </div>
                </div>

                {/* Preset Palettes */}
                <div>
                  <Label className="text-sm font-medium mb-3 block">Quick Presets</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {PRESET_COLORS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => {
                          setAccentColor(preset.accent);
                          setBgColor(preset.bg);
                          setTextColor(preset.text);
                          markChanged();
                        }}
                        className="group flex flex-col items-center gap-1.5 p-2 rounded-lg border border-border hover:border-primary/50 transition-colors"
                      >
                        <div className="flex gap-0.5">
                          <div
                            className="w-5 h-5 rounded-full border border-white/10"
                            style={{ backgroundColor: preset.accent }}
                          />
                          <div
                            className="w-5 h-5 rounded-full border border-white/10"
                            style={{ backgroundColor: preset.bg }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                          {preset.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <AnimatePresence>
              {hasChanges && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                >
                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="w-full"
                    size="lg"
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Brand Settings
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Live Preview */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <Card className="bg-card border-border overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="w-5 h-5 text-primary" />
                  Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SlidePreview
                  accentColor={accentColor}
                  bgColor={bgColor}
                  textColor={textColor}
                  brandName={brandName}
                  logoUrl={logoPreview}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Live Preview Component ──────────────────────────────────────

function SlidePreview({
  accentColor,
  bgColor,
  textColor,
  brandName,
  logoUrl,
}: {
  accentColor: string;
  bgColor: string;
  textColor: string;
  brandName: string;
  logoUrl: string | null;
}) {
  const mutedText = adjustBrightness(textColor, -80);

  return (
    <div className="space-y-4">
      {/* Hook Slide Preview */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-medium">Hook Slide</p>
        <div
          className="rounded-lg overflow-hidden border border-border relative"
          style={{
            backgroundColor: bgColor,
            aspectRatio: "4/5",
          }}
        >
          {/* Accent line */}
          <div
            className="absolute left-6 w-12 h-1 rounded-full"
            style={{ backgroundColor: accentColor, top: "25%" }}
          />

          {/* Brand name */}
          {brandName && (
            <p
              className="absolute left-6 text-[8px] font-semibold tracking-widest"
              style={{ color: accentColor, top: "22%" }}
            >
              {brandName.toUpperCase()}
            </p>
          )}

          {/* Title */}
          <div className="absolute left-6 right-6" style={{ top: "32%" }}>
            <p className="text-sm font-bold leading-tight" style={{ color: textColor }}>
              How to Set Up Your
            </p>
            <p className="text-sm font-bold leading-tight" style={{ color: textColor }}>
              Development Environment
            </p>
          </div>

          {/* Subtitle */}
          <p
            className="absolute left-6 right-6 text-[8px]"
            style={{ color: mutedText, top: "50%" }}
          >
            A step-by-step guide to getting started
          </p>

          {/* Logo */}
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              className="absolute right-4 top-4 h-6 object-contain"
            />
          )}

          {/* Bottom accent bar */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1.5"
            style={{ backgroundColor: accentColor }}
          />

          {/* Border */}
          <div
            className="absolute inset-0.5 rounded-lg border-2 opacity-30 pointer-events-none"
            style={{ borderColor: accentColor }}
          />
        </div>
      </div>

      {/* Content Slide Preview */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-medium">Content Slide</p>
        <div
          className="rounded-lg overflow-hidden border border-border relative"
          style={{
            backgroundColor: bgColor,
            aspectRatio: "4/5",
          }}
        >
          {/* Step badge */}
          <div
            className="absolute left-4 top-4 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: accentColor }}
          >
            01
          </div>

          {/* Title */}
          <p
            className="absolute left-14 top-5 text-xs font-bold"
            style={{ color: textColor }}
          >
            Install Dependencies
          </p>

          {/* Divider */}
          <div
            className="absolute left-4 right-4 h-0.5"
            style={{ backgroundColor: accentColor, top: "14%" }}
          />

          {/* Instructions */}
          <p
            className="absolute left-4 text-[7px]"
            style={{ color: mutedText, top: "17%" }}
          >
            → Open your **terminal** application
          </p>
          <p
            className="absolute left-4 text-[7px]"
            style={{ color: mutedText, top: "21%" }}
          >
            → Run the **install** command
          </p>

          {/* Screenshot placeholder */}
          <div
            className="absolute left-4 right-4 bottom-4 rounded-lg border"
            style={{
              top: "28%",
              backgroundColor: adjustBrightness(bgColor, 15),
              borderColor: adjustBrightness(bgColor, 30),
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[8px]" style={{ color: mutedText }}>
                Screenshot Area
              </p>
            </div>

            {/* Highlight box */}
            <div
              className="absolute rounded border-2"
              style={{
                borderColor: accentColor,
                backgroundColor: `${accentColor}10`,
                left: "10%",
                top: "20%",
                width: "40%",
                height: "15%",
              }}
            />

            {/* Badge on screenshot */}
            <div
              className="absolute w-4 h-4 rounded-full flex items-center justify-center text-[6px] font-bold text-white"
              style={{
                backgroundColor: accentColor,
                left: "55%",
                top: "18%",
              }}
            >
              1
            </div>
          </div>

          {/* Logo watermark */}
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              className="absolute right-3 bottom-3 h-4 object-contain opacity-70"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Utilities ──────────────────────────────────────────────────

function adjustBrightness(hex: string, amount: number): string {
  if (!hex || hex.length < 7) return hex;
  const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + amount));
  const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + amount));
  const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/...;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
