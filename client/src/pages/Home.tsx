import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Sparkles,
  Zap,
  Download,
  ArrowRight,
  Globe,
  Wand2,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-[100px] right-[-200px] w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="container relative pt-24 pb-20 lg:pt-32 lg:pb-28">
          <motion.div
            className="max-w-3xl mx-auto text-center"
            initial="initial"
            animate="animate"
            transition={{ staggerChildren: 0.12 }}
          >
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-8"
            >
              <Sparkles className="w-3.5 h-3.5" />
              URL to Annotated Tutorial Images
            </motion.div>

            <motion.h1
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6"
            >
              Turn any website into{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-pink-400">
                annotated tutorials
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
            >
              Paste a URL. Get beautiful, annotated tutorial images with numbered
              steps, arrows, highlights, and callouts — ready for Instagram
              carousels and LinkedIn posts. No Canva. No Figma. Just AI.
            </motion.p>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              {isAuthenticated ? (
                <Link href="/generate">
                  <Button
                    size="lg"
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-base px-8 h-12 rounded-xl shadow-lg shadow-primary/20"
                  >
                    <Zap className="w-4.5 h-4.5" />
                    Start Generating
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <Link href="/register">
                  <Button
                    size="lg"
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-base px-8 h-12 rounded-xl shadow-lg shadow-primary/20"
                  >
                    <Zap className="w-4.5 h-4.5" />
                    Get Started Free
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-border/50">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold mb-4">How it works</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Three steps from URL to social-ready annotated images
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: Globe,
                step: "01",
                title: "Paste a URL",
                desc: "Enter any website URL. We scrape content, capture screenshots, and discover images automatically.",
              },
              {
                icon: Wand2,
                step: "02",
                title: "AI Annotates",
                desc: "Our AI analyzes the page, plans a tutorial carousel, and adds numbered badges, arrows, and highlights.",
              },
              {
                icon: Download,
                step: "03",
                title: "Export & Share",
                desc: "Download vertical images optimized for Instagram (4:5), Stories (9:16), or LinkedIn carousels.",
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="relative group"
              >
                <div className="p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <feature.icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-xs font-bold text-primary/60 tracking-widest">
                      STEP {feature.step}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Output formats */}
      <section className="py-20 border-t border-border/50">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold mb-4">
              Vertical formats for every platform
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Choose the perfect aspect ratio for your content
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-6">
            {[
              { ratio: "3:4", w: 120, h: 160, label: "Pinterest / Blog" },
              { ratio: "4:5", w: 128, h: 160, label: "Instagram Feed" },
              { ratio: "9:16", w: 90, h: 160, label: "Stories / Reels" },
            ].map((fmt, i) => (
              <motion.div
                key={fmt.ratio}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex flex-col items-center gap-3"
              >
                <div
                  className="rounded-xl border-2 border-primary/30 bg-card/50 flex items-center justify-center"
                  style={{ width: fmt.w, height: fmt.h }}
                >
                  <span className="text-primary font-bold text-lg">
                    {fmt.ratio}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{fmt.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="container">
          <div className="text-center mb-8">
            <p className="text-sm text-muted-foreground mb-4">
              Built with AI-powered annotation engine
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground/60">
              <span>Powered by</span>
              <a href="https://www.hostinger.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Hostinger
              </a>
              <span className="hidden sm:inline text-muted-foreground/30">·</span>
              <a href="https://openai.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                OpenAI
              </a>
              <span className="hidden sm:inline text-muted-foreground/30">·</span>
              <a href="https://screenshotone.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                ScreenshotOne
              </a>
              <span className="hidden sm:inline text-muted-foreground/30">·</span>
              <a href="https://steel.dev" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Steel.dev
              </a>
              <span className="hidden sm:inline text-muted-foreground/30">·</span>
              <a href="https://dokploy.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Dokploy
              </a>
            </div>
          </div>
          <div className="text-center text-xs text-muted-foreground/40">
            Built for the Hostinger Hackathon 2026
          </div>
        </div>
      </footer>
    </div>
  );
}

