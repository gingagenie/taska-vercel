import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Camera, Loader2, Wrench, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Equipment {
  id: string;
  name: string;
}

interface RequestServiceButtonProps {
  orgId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  equipment: Equipment[];
}

export function RequestServiceButton({
  orgId,
  customerId,
  customerName,
  customerEmail,
  customerPhone,
  equipment,
}: RequestServiceButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "urgent">("normal");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string[]>([]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length + photos.length > 5) {
      toast({
        title: "Too many photos",
        description: "You can only upload up to 5 photos",
        variant: "destructive",
      });
      return;
    }

    // Validate file sizes
    const invalidFiles = files.filter(f => f.size > 10 * 1024 * 1024);
    if (invalidFiles.length > 0) {
      toast({
        title: "File too large",
        description: "Photos must be less than 10MB each",
        variant: "destructive",
      });
      return;
    }

    // Create preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    
    setPhotos([...photos, ...files]);
    setPhotoPreview([...photoPreview, ...newPreviews]);
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    const newPreviews = photoPreview.filter((_, i) => i !== index);
    
    // Revoke URL to prevent memory leaks
    URL.revokeObjectURL(photoPreview[index]);
    
    setPhotos(newPhotos);
    setPhotoPreview(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("org_id", orgId);
      formData.append("customer_id", customerId);
      formData.append("customer_name", customerName);
      if (customerEmail) formData.append("customer_email", customerEmail);
      if (customerPhone) formData.append("customer_phone", customerPhone);
      
      if (selectedEquipmentId) {
        formData.append("equipment_id", selectedEquipmentId);
        const selectedEquipment = equipment.find(e => e.id === selectedEquipmentId);
        if (selectedEquipment) {
          formData.append("equipment_name", selectedEquipment.name);
        }
      }
      
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("urgency", urgency);

      // Add photos
      photos.forEach((photo) => {
        formData.append("photos", photo);
      });

      const response = await fetch("/api/service-requests", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to submit service request");
      }

      const result = await response.json();

      setSubmitted(true);
      
      toast({
        title: "Request submitted!",
        description: "We'll get back to you as soon as possible",
      });

      // Reset form after a delay
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setTitle("");
        setDescription("");
        setSelectedEquipmentId("");
        setUrgency("normal");
        setPhotos([]);
        setPhotoPreview([]);
      }, 2000);

    } catch (error: any) {
      console.error("Error submitting service request:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit request",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full" size="lg">
            <Wrench className="mr-2 h-5 w-5" />
            Request Service
          </Button>
        </DialogTrigger>
        <DialogContent>
          <div className="text-center py-8">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Request Submitted!</h3>
            <p className="text-gray-600">We'll get back to you as soon as possible</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" size="lg">
          <Wrench className="mr-2 h-5 w-5" />
          Request Service
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Service</DialogTitle>
          <DialogDescription>
            Let us know what needs attention and we'll get back to you quickly
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Equipment Selection */}
          <div>
            <Label htmlFor="equipment">Equipment (Optional)</Label>
            <Select value={selectedEquipmentId} onValueChange={setSelectedEquipmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select equipment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None - General inquiry</SelectItem>
                {equipment.map((eq) => (
                  <SelectItem key={eq.id} value={eq.id}>
                    {eq.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title">Issue Summary *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Engine won't start"
              maxLength={100}
              required
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail..."
              rows={4}
              maxLength={1000}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {description.length}/1000 characters
            </p>
          </div>

          {/* Urgency */}
          <div>
            <Label>Urgency</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant={urgency === "normal" ? "default" : "outline"}
                onClick={() => setUrgency("normal")}
                className="flex-1"
              >
                Normal
              </Button>
              <Button
                type="button"
                variant={urgency === "urgent" ? "destructive" : "outline"}
                onClick={() => setUrgency("urgent")}
                className="flex-1"
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                Urgent
              </Button>
            </div>
          </div>

          {/* Photo Upload */}
          <div>
            <Label>Photos (Optional)</Label>
            <p className="text-xs text-gray-500 mb-2">
              Upload up to 5 photos (10MB each)
            </p>

            {photoPreview.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {photoPreview.map((preview, index) => (
                  <div key={index} className="relative">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded border"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 5 && (
              <label className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                <Camera className="h-8 w-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-600">Click to upload photos</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {urgency === "urgent" && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Urgent requests are prioritized and will be reviewed immediately during business hours.
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
