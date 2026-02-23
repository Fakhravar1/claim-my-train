import { useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const Login = () => {
  const { user, loading, signInWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const redirectPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("next");
    return raw && raw.startsWith("/") ? raw : "/";
  }, [location.search]);

  useEffect(() => {
    if (!loading && user) {
      navigate(redirectPath, { replace: true });
    }
  }, [loading, user, navigate, redirectPath]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="p-8 max-w-sm w-full text-center space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to track your delays and claims.
        </p>
        <Button
          onClick={async () => {
            try {
              await signInWithGoogle(redirectPath);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unable to start Google sign-in";
              toast({
                title: "Sign in failed",
                description: message,
                variant: "destructive",
              });
            }
          }}
          className="w-full"
          size="lg"
        >
          Sign in with Google
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/")}>
          Back to departures
        </Button>
      </Card>
    </div>
  );
};

export default Login;
