import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Zap, FolderOpen, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Projects() {
  const { isAuthenticated, loading } = useAuth({ redirectOnUnauthenticated: true });
  const projectsQuery = trpc.project.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="container py-10 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">My Projects</h1>
              <p className="text-sm text-muted-foreground mt-1">
                All your generated carousel projects
              </p>
            </div>
            <Link href="/generate">
              <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
                <Zap className="w-3.5 h-3.5" />
                New Project
              </Button>
            </Link>
          </div>

          {projectsQuery.isLoading ? (
            <div className="text-center py-20 text-muted-foreground">Loading projects...</div>
          ) : !projectsQuery.data || projectsQuery.data.length === 0 ? (
            <div className="text-center py-20">
              <FolderOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No projects yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Generate your first annotated carousel from any URL
              </p>
              <Link href="/generate">
                <Button className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Zap className="w-3.5 h-3.5" />
                  Create Your First Project
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-3">
              {projectsQuery.data.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  <Link href={`/project/${project.id}`}>
                    <div className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/50 hover:border-primary/30 transition-all duration-200 cursor-pointer group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-sm truncate">
                            {project.title || "Untitled Project"}
                          </h3>
                          <StatusBadge status={project.status} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {project.url}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>{project.aspectRatio}</span>
                          <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    scraping: "bg-blue-500/20 text-blue-400",
    analyzing: "bg-purple-500/20 text-purple-400",
    generating: "bg-primary/20 text-primary",
    completed: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}
