import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api";
import { Link, useLocation } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


import { Mail, Phone, MapPin, MoreHorizontal, Edit, ArrowRight } from "lucide-react";
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


  const [q, setQ] = useState("");
  const [, navigate] = useLocation();

  const filtered = useMemo(() => {
    const text = q.toLowerCase();
    const byText = (c: any) =>
      [c.name, c.contact_name, c.email, c.phone, addrLine(c), c.notes]
        .join(" ")
        .toLowerCase()
        .includes(text);

    return (list as any[]).filter(byText);
  }, [list, q]);

  return (
    <div className="space-y-4">
      <div className="header-row">
        <h1 className="text-2xl font-bold">Customers</h1>
        <div className="header-actions">
          <Input
            placeholder="Search company, contact, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-72"
            data-testid="input-search-customers"
          />
          <Button 
            onClick={() => navigate("/customers/new")} 
            data-testid="button-new-customer"
            data-mobile-full="true"
          >
            New Customer
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Loading customers...</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              {q ? "No customers match your search" : "No customers found. Create your first customer!"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((c: any) => {
            const addr = addrLine(c);
            const hue = hueFrom(c.name);
            return (
              <Card 
                key={c.id} 
                className="hover:shadow-md hover:bg-gray-50 transition-all cursor-pointer group"
                onClick={() => navigate(`/customers/${c.id}`)}
                data-testid={`card-customer-${c.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start gap-3">
                        <div
                          className="h-12 w-12 flex items-center justify-center rounded-lg text-white text-sm font-semibold shadow-sm shrink-0"
                          style={{ background: `hsl(${hue} 70% 45%)` }}
                        >
                          {initials(c.name)}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-lg group-hover:text-blue-600 transition-colors">
                            {c.name || "Unnamed Customer"}
                          </div>
                          {c.contact_name && (
                            <div className="text-sm text-gray-600">
                              Contact: {c.contact_name}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500">Email</div>
                          <div className="font-medium flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {c.email || "—"}
                          </div>
                        </div>
                        
                        <div>
                          <div className="text-gray-500">Phone</div>
                          <div className="font-medium flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {c.phone || "—"}
                          </div>
                        </div>
                        
                        <div>
                          <div className="text-gray-500">Address</div>
                          <div className="font-medium flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {addr || "—"}
                          </div>
                        </div>
                      </div>
                      
                      {c.notes && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Notes</div>
                          <div className="text-sm text-gray-700">{c.notes}</div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-blue-500 transition-colors pt-1">
                        <span>Click for details</span>
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 opacity-70 hover:opacity-100"
                          data-testid={`button-actions-customer-${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/customers/${c.id}/edit`);
                        }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}