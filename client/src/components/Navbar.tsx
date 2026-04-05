import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "wouter";
import { Sparkles, LogOut, Palette, Zap, FolderOpen, Sun, Moon, Monitor } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "U";
}

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme, setTheme } = useTheme();

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl"
    >
      <div className="container flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground tracking-tight">
            Annotate<span className="text-primary">AI</span>
          </span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {location !== "/generate" && (
                <Link href="/generate">
                  <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Zap className="w-3.5 h-3.5" />
                    Generate
                  </Button>
                </Link>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="focus:outline-none">
                    <Avatar className="w-9 h-9 cursor-pointer ring-2 ring-transparent hover:ring-primary/50 transition-all">
                      <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                        {getInitials(user?.name, user?.email)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-2">
                  <div className="px-2 py-2.5">
                    <p className="text-sm font-medium text-foreground">{user?.name || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>

                  {/* Theme switcher — OpenAI style pill row */}
                  {setTheme && (
                    <div
                      className="flex items-center gap-0.5 mx-2 my-1.5 p-1 rounded-lg bg-muted/50"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ThemeButton
                        active={theme === "light"}
                        onClick={() => setTheme("light")}
                        icon={<Sun className="w-3.5 h-3.5" />}
                      />
                      <ThemeButton
                        active={theme === "dark"}
                        onClick={() => setTheme("dark")}
                        icon={<Moon className="w-3.5 h-3.5" />}
                      />
                      <ThemeButton
                        active={theme === "system"}
                        onClick={() => setTheme("system")}
                        icon={<Monitor className="w-3.5 h-3.5" />}
                      />
                    </div>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => setLocation("/projects")}
                    className="cursor-pointer rounded-md px-2 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <FolderOpen className="w-4 h-4 mr-2.5" />
                    My Projects
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setLocation("/brand")}
                    className="cursor-pointer rounded-md px-2 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <Palette className="w-4 h-4 mr-2.5" />
                    Brand Settings
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="cursor-pointer rounded-md px-2 py-2 text-muted-foreground hover:text-foreground"
                  >
                    <LogOut className="w-4 h-4 mr-2.5" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Sign In
              </Button>
            </Link>
          )}
        </div>
      </div>
    </motion.nav>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className={`flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground/60 hover:text-muted-foreground"
      }`}
    >
      {icon}
    </button>
  );
}
