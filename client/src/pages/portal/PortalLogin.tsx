import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function PortalLogin() {
  const params = useParams() as any;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // ✅ if someone hits /portal/login with no org, default to your org slug
  const org = (params?.org || "fixmyforklift") as string;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-gray-100 grid place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Customer Portal Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
          />
          <Button onClick={onLogin} disabled={loading || !email || !password} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
