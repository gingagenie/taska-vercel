import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { quotesApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";

export default function QuotesPage() {
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useQuery({ queryKey:["/api/quotes"], queryFn: quotesApi.getAll });
  const [q, setQ] = useState("");

  const filtered = (list as any[]).filter(x => [x.title,x.customer_name,x.status].join(" ").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page space-y-4">
      <div className="header-row">
        <h1 className="text-2xl font-bold">Quotes</h1>
        <div className="header-actions">
          <Input className="w-64" placeholder="Search quotes…" value={q} onChange={(e)=>setQ(e.target.value)} />
          <Link href="/quotes/new"><a><Button data-mobile-full="true">New Quote</Button></a></Link>
        </div>
      </div>

      <Card><CardContent className="card-pad">
        {isLoading ? "Loading…" : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr><th className="px-3 py-2 text-left">Title</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((q:any)=>(
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-left">
                      <Link href={`/quotes/${q.id}`}><a className="font-medium hover:underline">{q.title}</a></Link>
                    </td>
                    <td className="px-3 py-2 text-center">{q.customer_name}</td>
                    <td className="px-3 py-2 text-center capitalize">{q.status}</td>
                    <td className="px-3 py-2 text-center">
                      <Link href={`/quotes/${q.id}/edit`}><a className="text-blue-600">Edit</a></Link>
                    </td>
                  </tr>
                ))}
                {filtered.length===0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-500">No quotes</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}