import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  MessageCircle, 
  X, 
  Send, 
  Bot, 
  User, 
  Loader2,
  Wrench,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface AIChatResponse {
  response: string;
  timestamp: string;
  tokensUsed: number;
}

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm TaskaAI, your Taska app assistant. I can help you with:\n\n📋 Creating and managing jobs\n👥 Customer management\n🔧 Equipment tracking\n💰 Quotes and invoices\n⚙️ App navigation\n\nWhat can I help you with today?",
      timestamp: new Date().toISOString()
    }
  ]);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [conversation]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const response = await apiRequest("POST", "/api/ai-support/chat", {
        message: userMessage,
        conversationHistory: conversation.slice(-10).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      });
      return response as unknown as AIChatResponse;
    },
    onSuccess: (data, userMessage) => {
      // Add AI response
      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.response,
        timestamp: data.timestamp
      };
      
      setConversation(prev => [...prev, aiMessage]);
    },
    onError: (error: any) => {
      console.error("AI Chat error:", error);
      
      let errorMessage = "Sorry, I'm having trouble right now. Please try again.";
      
      if (error.message?.includes("402")) {
        errorMessage = "AI service quota exceeded. Please contact support.";
      } else if (error.message?.includes("429")) {
        errorMessage = "Too many requests. Please wait a moment and try again.";
      }
      
      toast({
        title: "AI Assistant Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  const handleSendMessage = async () => {
    if (!message.trim() || chatMutation.isPending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message.trim(),
      timestamp: new Date().toISOString()
    };

    setConversation(prev => [...prev, userMessage]);
    setMessage("");
    
    chatMutation.mutate(userMessage.content);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const renderMessageContent = (content: string) => {
    // Simple formatting for better readability
    if (!content || typeof content !== 'string') {
      return <div>Loading...</div>;
    }
    return content.split('\n').map((line, index) => (
      <div key={index}>
        {line}
        {index < content.split('\n').length - 1 && <br />}
      </div>
    ));
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 z-50"
          data-testid="button-open-ai-chat"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-96 h-[500px] shadow-xl z-50 flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">TaskaAI</CardTitle>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Online
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                data-testid="button-close-ai-chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              App Assistant for Jobs, Customers & More
            </p>
          </CardHeader>

          <Separator />

          <CardContent className="flex-1 p-0 flex flex-col">
            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {conversation.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-blue-600" />
                        </div>
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[280px] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <div>{renderMessageContent(msg.content)}</div>
                      <div
                        className={`text-xs mt-1 ${
                          msg.role === "user" ? "text-blue-100" : "text-gray-500"
                        }`}
                      >
                        {formatTimestamp(msg.timestamp)}
                      </div>
                    </div>

                    {msg.role === "user" && (
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                          <User className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing Indicator */}
                {chatMutation.isPending && (
                  <div className="flex gap-3 justify-start">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-blue-600" />
                      </div>
                    </div>
                    <div className="bg-gray-100 rounded-lg px-3 py-2 flex items-center gap-1">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                      <span className="text-sm text-gray-500">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <Separator />

            {/* Input Area */}
            <div className="p-4">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about equipment, procedures, or troubleshooting..."
                  disabled={chatMutation.isPending}
                  className="flex-1"
                  data-testid="input-ai-chat-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || chatMutation.isPending}
                  size="sm"
                  data-testid="button-send-ai-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Quick Actions */}
              <div className="flex gap-1 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs px-2 py-1 h-auto"
                  onClick={() => setMessage("How do I create a new job?")}
                  disabled={chatMutation.isPending}
                >
                  <Wrench className="h-3 w-3 mr-1" />
                  New Job
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs px-2 py-1 h-auto"
                  onClick={() => setMessage("How do I create an invoice?")}
                  disabled={chatMutation.isPending}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Invoice
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}