import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navigate } from "react-router-dom";

const Login = () => {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="p-8 max-w-sm w-full text-center space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to track your delays and claims.
        </p>
        <Button onClick={signInWithGoogle} className="w-full" size="lg">
          Sign in with Google
        </Button>
      </Card>
    </div>
  );
};

export default Login;
