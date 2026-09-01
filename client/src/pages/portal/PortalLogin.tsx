import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function PortalLogin() {
  const params = useParams() as any;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // ✅ if someone hits /portal/login with no org, default to your org slug
  const org = (params?.org || "fixmyforklift") as string;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  // Handle admin impersonation token in query string
  useEffect(() => {
    const impersonateToken = new URLSearchParams(window.location.search).get("impersonateToken");
    if (!impersonateToken) return;

    setImpersonating(true);
    fetch(`/api/portal/${org}/impersonate-exchange`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: impersonateToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Impersonation failed");
        }
        return res.json();
      })
      .then(() => {
        navigate(`/portal/${org}/equipment`);
      })
      .catch((e: any) => {
        toast({ title: "Impersonation failed", description: e.message, variant: "destructive" });
        setImpersonating(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org]);

  async function onLogin() {
    try {
      setLoading(true);

      const resp = await fetch(`/api/portal/${org}/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Login failed");
      }

      navigate(`/portal/${org}/equipment`);
    } catch (e: any) {
      toast({ title: "Login failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (impersonating) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-400" />
          <p className="text-lg font-medium">Opening portal as admin…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen grid place-items-center p-4 relative bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2070')"
      }}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-gray-800/90" />
      
      {/* Login card */}
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-gray-700 bg-white/95 backdrop-blur">
        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center justify-center mb-2">
            {/* You can replace this with your actual logo */}
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
              <span className="text-white font-bold text-xl">FMF</span>
            </div>
          </div>
          <CardTitle className="text-center text-2xl">Customer Portal</CardTitle>
          <p className="text-center text-sm text-gray-600">
            Access your equipment and service history
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <Input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="your@email.com"
              type="email"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              type="password"
              className="h-11"
              onKeyDown={(e) => {
                if (e.key === "Enter" && email && password && !loading) {
                  onLogin();
                }
              }}
            />
          </div>

          {/* Forgot Password Link */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate(`/portal/${org}/forgot-password`)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Forgot password?
            </button>
          </div>

          <Button 
            onClick={onLogin} 
            disabled={loading || !email || !password} 
            className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          
          <div className="text-center text-sm text-gray-600 pt-2">
            Need help? Contact your service provider
          </div>
        </CardContent>
      </Card>
      
      {/* Footer */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-white/60 text-sm z-10">
        Powered by Fix My Forklift
      </div>
    </div>
  );
}
