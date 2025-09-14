import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supportTicketsApi } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, ArrowLeft, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TicketCategory {
  id: string;
  name: string;
  description?: string;
}

interface CategoriesResponse {
  categories: TicketCategory[];
}

export default function CreateSupportTicket() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    categoryId: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categoriesData, isLoading: isLoadingCategories } = useQuery<CategoriesResponse>({
    queryKey: ["/api/support-tickets/categories"],
    queryFn: () => supportTicketsApi.getCategories(),
  });

  const createTicketMutation = useMutation({
    mutationFn: supportTicketsApi.create,
    onSuccess: (data) => {
      toast({
        title: "Ticket Created",
        description: "Your support ticket has been submitted successfully.",
      });
      // Invalidate tickets list to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/support-tickets"] });
      // Navigate to the new ticket
      setLocation(`/support/ticket/${data.ticket.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create ticket. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = "Title is required";
    } else if (formData.title.length < 5) {
      newErrors.title = "Title must be at least 5 characters";
    }

    if (!formData.description.trim()) {
      newErrors.description = "Description is required";
    } else if (formData.description.length < 10) {
      newErrors.description = "Description must be at least 10 characters";
    }

    if (!formData.categoryId) {
      newErrors.categoryId = "Please select a category";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form before submitting.",
        variant: "destructive",
      });
      return;
    }

    createTicketMutation.mutate(formData);
  };

  const categories = categoriesData?.categories || [];

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="header-row">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/support")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-create-ticket-title">Create Support Ticket</h1>
            <p className="text-gray-600" data-testid="text-create-ticket-subtitle">
              Describe your issue and our support team will help you
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl">
        {/* Instructions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg" data-testid="text-instructions-title">
              <AlertCircle className="h-5 w-5 text-blue-500" />
              Before You Submit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-gray-600">
              <p>To help us resolve your issue quickly, please:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Choose the most appropriate category for your issue</li>
                <li>Provide a clear, descriptive title</li>
                <li>Include detailed steps to reproduce the problem</li>
                <li>Mention your browser and device if relevant</li>
                <li>Attach screenshots if they would help explain the issue</li>
              </ul>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-blue-800 font-medium">Expected Response Times:</p>
                <ul className="text-blue-700 text-sm mt-1">
                  <li>• High Priority: Within 2 hours</li>
                  <li>• Medium Priority: Within 4 hours</li>
                  <li>• Low Priority: Within 24 hours</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create Ticket Form */}
        <Card>
          <CardHeader>
            <CardTitle data-testid="text-ticket-details">Ticket Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Brief description of your issue"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  className={errors.title ? "border-red-500" : ""}
                  data-testid="input-title"
                />
                {errors.title && (
                  <p className="text-sm text-red-600" data-testid="error-title">
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category" className="text-sm font-medium">
                  Category <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => handleInputChange("categoryId", value)}
                >
                  <SelectTrigger className={errors.categoryId ? "border-red-500" : ""} data-testid="select-category">
                    <SelectValue placeholder={isLoadingCategories ? "Loading categories..." : "Select a category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id} data-testid={`category-${category.id}`}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.categoryId && (
                  <p className="text-sm text-red-600" data-testid="error-category">
                    {errors.categoryId}
                  </p>
                )}
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label htmlFor="priority" className="text-sm font-medium">
                  Priority <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => handleInputChange("priority", value)}
                >
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" data-testid="priority-low">
                      Low - General questions or minor issues
                    </SelectItem>
                    <SelectItem value="medium" data-testid="priority-medium">
                      Medium - Issues affecting your work
                    </SelectItem>
                    <SelectItem value="high" data-testid="priority-high">
                      High - Critical issues blocking your work
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="Please provide a detailed description of your issue, including steps to reproduce it if applicable..."
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  className={`min-h-[120px] ${errors.description ? "border-red-500" : ""}`}
                  data-testid="textarea-description"
                />
                {errors.description && (
                  <p className="text-sm text-red-600" data-testid="error-description">
                    {errors.description}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={createTicketMutation.isPending}
                  className="flex items-center gap-2"
                  data-testid="button-submit"
                >
                  {createTicketMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/support")}
                  disabled={createTicketMutation.isPending}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}