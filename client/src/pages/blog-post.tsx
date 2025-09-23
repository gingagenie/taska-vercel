import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Clock, 
  User, 
  ArrowLeft,
  Share2
} from "lucide-react";
import { useEffect } from "react";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  content: string;
  authorName?: string;
  category?: string;
  tags?: string[];
  status: string;
  coverImageUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  publishedAt?: string;
  updatedAt?: string;
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading, error } = useQuery<BlogPost>({
    queryKey: ['/api/public/blog', slug],
    enabled: !!slug,
  });

  // Set SEO metadata when post loads
  useEffect(() => {
    if (post) {
      // Set page title
      document.title = post.metaTitle || `${post.title} | Taska Blog`;
      
      // Set meta description
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.setAttribute('name', 'description');
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute('content', post.metaDescription || post.excerpt || 'Read more on the Taska Blog');
      
      // Set Open Graph tags
      let ogTitle = document.querySelector('meta[property="og:title"]');
      if (!ogTitle) {
        ogTitle = document.createElement('meta');
        ogTitle.setAttribute('property', 'og:title');
        document.head.appendChild(ogTitle);
      }
      ogTitle.setAttribute('content', post.title);
      
      let ogDescription = document.querySelector('meta[property="og:description"]');
      if (!ogDescription) {
        ogDescription = document.createElement('meta');
        ogDescription.setAttribute('property', 'og:description');
        document.head.appendChild(ogDescription);
      }
      ogDescription.setAttribute('content', post.metaDescription || post.excerpt || 'Read more on the Taska Blog');
      
      // Set canonical URL
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', `${window.location.origin}/blog/${post.slug}`);
    }
  }, [post]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/4 mb-4"></div>
            <div className="h-12 bg-gray-300 rounded w-3/4 mb-6"></div>
            <div className="h-4 bg-gray-300 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-300 rounded w-full"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Post Not Found</h1>
          <p className="text-gray-600 mb-6">
            The blog post you're looking for doesn't exist or may have been removed.
          </p>
          <div className="space-x-4">
            <Button 
              variant="outline"
              onClick={() => window.history.back()}
              data-testid="button-go-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button 
              onClick={() => window.location.href = "/blog"}
              data-testid="button-browse-blog"
            >
              Browse Blog
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost"
              onClick={() => window.location.href = "/blog"}
              data-testid="button-back-to-blog"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blog
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: post.title,
                    text: post.excerpt,
                    url: window.location.href
                  });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
              data-testid="button-share"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </div>

      <article className="max-w-4xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <header className="mb-12">
          {/* Category and Tags */}
          {(post.category || post.tags?.length) && (
            <div className="flex flex-wrap gap-2 mb-4" data-testid="post-meta">
              {post.category && (
                <Badge variant="secondary" className="text-xs">
                  {post.category}
                </Badge>
              )}
              {post.tags?.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          
          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight" data-testid="post-title">
            {post.title}
          </h1>
          
          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-xl text-gray-600 leading-relaxed mb-8 max-w-3xl" data-testid="post-excerpt">
              {post.excerpt}
            </p>
          )}
          
          {/* Meta Information */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 border-l-4 border-blue-500 pl-4" data-testid="post-metadata">
            {post.authorName && (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>By {post.authorName}</span>
              </div>
            )}
            {post.publishedAt && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(post.publishedAt)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{calculateReadTime(post.content)} min read</span>
            </div>
          </div>
        </header>

        {/* Cover Image */}
        {post.coverImageUrl && (
          <div className="mb-12">
            <img 
              src={post.coverImageUrl}
              alt={post.title}
              className="w-full h-64 md:h-96 object-cover rounded-lg shadow-lg"
              data-testid="post-cover-image"
            />
          </div>
        )}

        {/* Content */}
        <div className="prose prose-lg prose-gray max-w-none mb-12" data-testid="post-content">
          <div dangerouslySetInnerHTML={{ __html: post.content }} />
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-200 pt-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Tags:</span>
              {post.tags?.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            
            <div className="flex items-center gap-4">
              <Button 
                variant="outline"
                onClick={() => window.location.href = "/blog"}
                data-testid="button-more-posts"
              >
                More Posts
              </Button>
              <Button 
                onClick={() => window.location.href = "/"}
                data-testid="button-back-home"
              >
                Back to Taska
              </Button>
            </div>
          </div>
        </footer>
      </article>

      {/* Newsletter Signup */}
      <section className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t border-blue-200">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Stay Updated with Field Service Insights
          </h3>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Get the latest tips, best practices, and industry insights delivered to your inbox. 
            Join thousands of field service professionals who rely on our expert guidance.
          </p>
          <Button className="px-8" data-testid="button-subscribe-newsletter">
            Subscribe to Newsletter
          </Button>
          <p className="text-xs text-gray-500 mt-3">
            No spam, unsubscribe anytime. Privacy policy applies.
          </p>
        </div>
      </section>
    </div>
  );
}