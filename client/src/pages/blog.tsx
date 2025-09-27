import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Calendar, 
  Clock, 
  User, 
  Search, 
  ArrowRight,
  Wrench,
  TrendingUp,
  Smartphone,
  Settings
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  authorName?: string;
  category?: string;
  tags?: string[];
  coverImageUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
}

interface BlogResponse {
  posts: BlogPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const categories = ["All", "Business Growth", "Customer Experience", "Technology", "Operations", "Equipment"];

export default function Blog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [email, setEmail] = useState("");
  const { toast } = useToast();
  
  // Build query parameters
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.append('search', searchQuery);
    if (selectedCategory !== 'All') params.append('category', selectedCategory);
    params.append('page', currentPage.toString());
    params.append('limit', '10');
    return params.toString();
  }, [searchQuery, selectedCategory, currentPage]);
  
  const { data: blogResponse, isLoading, error } = useQuery<BlogResponse>({
    queryKey: ['/api/public/blog', searchQuery, selectedCategory, currentPage],
    queryFn: async () => {
      const response = await fetch(`/api/public/blog?${queryParams}`);
      if (!response.ok) {
        throw new Error('Failed to fetch blog posts');
      }
      return response.json();
    },
  });
  
  const posts = blogResponse?.posts || [];
  const pagination = blogResponse?.pagination;
  const featuredPost = posts.find(post => post.coverImageUrl); // Use cover image as featured indicator
  const otherPosts = posts.filter(post => post !== featuredPost);

  // Newsletter subscription mutation
  const subscriptionMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch('/api/public/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, source: 'blog' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to subscribe');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setEmail(''); // Clear the email input
      toast({
        title: "Successfully subscribed!",
        description: "Thank you for subscribing to our newsletter. You'll receive the latest field service insights directly in your inbox.",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Subscription failed",
        description: error.message || "There was an issue subscribing to our newsletter. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address to subscribe.",
        variant: "destructive",
      });
      return;
    }

    subscriptionMutation.mutate(email.trim());
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  };
  
  const calculateReadTime = (content: string) => {
    const wordsPerMinute = 200;
    const words = content.replace(/<[^>]*>/g, '').split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
  };
  
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1); // Reset to first page on search
  };
  
  const handleCategoryFilter = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1); // Reset to first page on filter change
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Business Growth": return <TrendingUp className="w-4 h-4" />;
      case "Technology": return <Smartphone className="w-4 h-4" />;
      case "Equipment": return <Wrench className="w-4 h-4" />;
      case "Operations": return <Settings className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900" data-testid="title-blog">
                Taska Blog
              </h1>
              <p className="text-gray-600 mt-1">
                Insights, tips, and best practices for field service businesses
              </p>
            </div>
            <Button 
              variant="outline"
              onClick={() => window.location.href = "/"}
              data-testid="button-back-home"
            >
              ← Back to Home
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Search and Filter */}
        <Card className="p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search articles..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                data-testid="input-blog-search"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Badge
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  className="cursor-pointer hover:bg-blue-50"
                  onClick={() => handleCategoryFilter(category)}
                  data-testid={`filter-${category.toLowerCase().replace(' ', '-')}`}
                >
                  {category}
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        {/* Featured Post */}
        {featuredPost && (
          <Card className="mb-8 overflow-hidden" data-testid="featured-post">
            <div className="md:flex">
              <div className="md:w-1/2 bg-gradient-to-br from-blue-500 to-blue-600 p-8 text-white">
                <Badge variant="secondary" className="mb-4">
                  Featured Article
                </Badge>
                <h2 className="text-2xl md:text-3xl font-bold mb-4">
                  {featuredPost.title}
                </h2>
                <p className="text-blue-100 mb-6 text-lg">
                  {featuredPost.excerpt}
                </p>
                <div className="flex items-center gap-4 text-sm text-blue-100 mb-6">
                  {featuredPost.authorName && (
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {featuredPost.authorName}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDate(featuredPost.publishedAt || '')}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    5 min read
                  </div>
                </div>
                <Link href={`/blog/${featuredPost.slug}`}>
                  <Button 
                    variant="secondary" 
                    className="group"
                    data-testid="button-read-featured"
                  >
                    Read Article
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
              <div className="md:w-1/2 p-8">
                <div className="flex flex-wrap gap-2 mb-4">
                  {featuredPost.tags?.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                {featuredPost.category && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                    {getCategoryIcon(featuredPost.category)}
                    <span>{featuredPost.category}</span>
                  </div>
                )}
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-600">
                    Field service management has evolved dramatically in recent years. Modern businesses
                    are discovering that the right software tools don't just organize operations—they
                    fundamentally transform how companies deliver value to customers while maximizing
                    profitability.
                  </p>
                  <p className="text-gray-600">
                    From automated scheduling that reduces travel time to real-time customer notifications
                    that eliminate no-shows, every feature in a comprehensive field service platform
                    contributes directly to your bottom line...
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Other Posts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {otherPosts.map((post) => (
            <Card key={post.id} className="group hover:shadow-lg transition-all duration-300" data-testid={`blog-post-${post.id}`}>
              <div className="p-6">
                {post.category && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    {getCategoryIcon(post.category)}
                    <span>{post.category}</span>
                  </div>
                )}
                
                <h3 className="text-xl font-semibold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                  {post.title}
                </h3>
                
                <p className="text-gray-600 mb-4 line-clamp-3">
                  {post.excerpt}
                </p>
                
                <div className="flex flex-wrap gap-1 mb-4">
                  {post.tags?.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-3">
                    {post.authorName && (
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {post.authorName}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      5m
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(post.publishedAt || '')}
                  </div>
                </div>
                
                <Link href={`/blog/${post.slug}`}>
                  <Button 
                    variant="ghost" 
                    className="w-full mt-4 group-hover:bg-blue-50 group-hover:text-blue-600"
                    data-testid={`button-read-post-${post.id}`}
                  >
                    Read More
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>

        {/* Newsletter Signup */}
        <Card className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <div className="p-8 text-center">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Stay Updated with Field Service Insights
            </h3>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              Get the latest tips, best practices, and industry insights delivered to your inbox. 
              Join thousands of field service professionals who rely on our expert guidance.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input 
                type="email"
                placeholder="Enter your email"
                className="flex-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={subscriptionMutation.isPending}
                data-testid="input-newsletter-email"
              />
              <Button 
                type="submit" 
                className="px-8" 
                disabled={subscriptionMutation.isPending}
                data-testid="button-newsletter-subscribe"
              >
                {subscriptionMutation.isPending ? "Subscribing..." : "Subscribe"}
              </Button>
            </form>
            <p className="text-xs text-gray-500 mt-3">
              No spam, unsubscribe anytime. Privacy policy applies.
            </p>
          </div>
        </Card>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center text-gray-600">
            <p>© 2025 Taska. All rights reserved.</p>
            <div className="flex justify-center gap-6 mt-4">
              <a href="/" className="hover:text-blue-600 transition-colors">Home</a>
              <a href="/privacy" className="hover:text-blue-600 transition-colors">Privacy</a>
              <a href="/auth/login" className="hover:text-blue-600 transition-colors">Login</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}