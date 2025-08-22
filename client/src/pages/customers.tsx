import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api";
import { Link, useLocation } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CustomerModal } from "@/components/modals/customer-modal";

// Tabs from shadcn; if missing, create a lightweight local component or ask agent to scaffold
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { Mail, Phone, MapPin, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

/** Helpers */
function addrLine(c: any) {
  return [c.street, c.suburb, c.state, c.postcode].filter(Boolean).join(", ");
}
function hasAddress(c: any) {
  return Boolean(c.street || c.suburb || c.state || c.postcode);
}
function initials(name?: string) {
  if (!name) return "C";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] || "").toUpperCase();
  const b = (parts[1]?.[0] || (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
  return (a + b).trim() || "C";
}
function hueFrom(name?: string) {
  const s = name || "Customer";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export default function Customers() {
  const { data: list = [], isLoading } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: customersApi.getAll,
  });

  const [tab, setTab] = useState<"all" | "email" | "phone" | "missingAddress">("all");
  const [q, setQ] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [, navigate] = useLocation();

  const filtered = useMemo(() => {
    const text = q.toLowerCase();
    const byText = (c: any) =>
      [c.name, c.contact_name, c.email, c.phone, addrLine(c)]
        .join(" ")
        .toLowerCase()
        .includes(text);

    let arr = (list as any[]).filter(byText);

    if (tab === "email") arr = arr.filter((c) => !!c.email);
    if (tab === "phone") arr = arr.filter((c) => !!c.phone);
    if (tab === "missingAddress") arr = arr.filter((c) => !hasAddress(c));

    return arr;
  }, [list, q, tab]);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="header-row">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <div className="text-sm text-gray-500">{list.length} total</div>
        </div>
        <div className="header-actions">
          <Input
            placeholder="Search company, contact, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:w-72"
            data-testid="input-search"
          />
          <Button 
            onClick={() => setOpenCreate(true)} 
            data-testid="button-new-customer"
            data-mobile-full="true"
          >
            New Customer
          </Button>
        </div>
      </div>

      {/* Full-width tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="email">With Email</TabsTrigger>
          <TabsTrigger value="phone">With Phone</TabsTrigger>
          <TabsTrigger value="missingAddress">Missing Address</TabsTrigger>
        </TabsList>

        {/* Shared table renderer */}
        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-gray-500">
                Loading…
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-gray-500">
                No customers found
              </CardContent>
            </Card>
          ) : (
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr className="[&>th]:px-4 [&>th]:py-3">
                    <th className="text-left">Company</th>
                    <th className="text-left">Contact</th>
                    <th className="text-left">Email</th>
                    <th className="text-left">Phone</th>
                    <th className="text-left">Address</th>
                    <th className="text-left w-10"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((c: any, i: number) => {
                    const addr = addrLine(c);
                    const hue = hueFrom(c.name);
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-gray-50 transition-colors cursor-pointer ${i % 2 ? "bg-gray-50/30" : "bg-white"}`}
                        onClick={() => navigate(`/customers/${c.id}`)}
                        data-testid={`row-customer-${c.id}`}
                      >
                        {/* Company */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="h-9 w-9 flex items-center justify-center rounded-lg text-white text-xs font-semibold shadow-sm shrink-0"
                              style={{ background: `hsl(${hue} 70% 45%)` }}
                            >
                              {initials(c.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[280px]">{c.name}</div>
                              {c.contact_name && (
                                <div className="text-xs text-gray-500 truncate max-w-[280px]">
                                  Primary: {c.contact_name}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-3">
                          <div className="truncate max-w-[180px]">{c.contact_name || "—"}</div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 truncate max-w-[240px] text-gray-700">
                            <Mail className="h-3.5 w-3.5 opacity-60" />
                            <span className="truncate">{c.email || "—"}</span>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 truncate max-w-[160px] text-gray-700">
                            <Phone className="h-3.5 w-3.5 opacity-60" />
                            <span className="truncate">{c.phone || "—"}</span>
                          </div>
                        </td>

                        {/* Address */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 truncate max-w-[360px] text-gray-700">
                            <MapPin className="h-3.5 w-3.5 opacity-60" />
                            <span className="truncate">{addr || "—"}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-70 hover:opacity-100">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem asChild>
                                <Link href={`/customers/${c.id}`}><a>View</a></Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/customers/${c.id}`)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700"
                                onClick={() => navigate(`/customers/${c.id}`)} // delete modal lives on view page
                              >
                                Delete…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create modal */}
      <CustomerModal open={openCreate} onOpenChange={setOpenCreate} />
    </div>
  );
}