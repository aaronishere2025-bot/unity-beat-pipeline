import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Send, Bot, User, Sparkles, Brain, Loader2, MessageSquare, Lightbulb } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: Date;
}

const exampleQuestions = [
  'What are my best performing videos and why?',
  'What themes should I focus on next week?',
  'Which historical figures would perform well?',
  'What posting times work best for my content?',
  'How can I improve my thumbnail strategy?',
  'What patterns do you see in my retention data?',
];

export default function AnalyticsChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<'claude' | 'gpt' | 'gemini'>('claude');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest('POST', '/api/strategic-summary/ask', {
        question,
        model: selectedModel,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.data?.answer || data.data?.response || 'No response received.',
        model: selectedModel,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: (error: Error) => {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${error.message}`,
        model: selectedModel,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = () => {
    if (!input.trim() || askMutation.isPending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    askMutation.mutate(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExampleClick = (question: string) => {
    setInput(question);
    textareaRef.current?.focus();
  };

  const getModelIcon = (model: string) => {
    switch (model) {
      case 'claude':
        return <Brain className="w-4 h-4" />;
      case 'gpt':
        return <Sparkles className="w-4 h-4" />;
      case 'gemini':
        return <Bot className="w-4 h-4" />;
      default:
        return <Bot className="w-4 h-4" />;
    }
  };

  const getModelColor = (model: string) => {
    switch (model) {
      case 'claude':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'gpt':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'gemini':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default:
        return '';
    }
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Analytics Chat
          </h1>
          <p className="text-muted-foreground">Ask questions about your video performance and strategy</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Model:</span>
          <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as 'claude' | 'gpt' | 'gemini')}>
            <SelectTrigger className="w-32" data-testid="select-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="gpt">GPT-4o</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="shrink-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="w-5 h-5" />
              Conversation
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 pt-0">
            <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Bot className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Ask the Analytics Engine</h3>
                  <p className="text-muted-foreground max-w-md mb-6">
                    Get AI-powered insights about your video performance, content strategy, and optimization
                    recommendations.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {exampleQuestions.slice(0, 3).map((q, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleExampleClick(q)}
                        data-testid={`button-example-${i}`}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {getModelIcon(message.model || 'claude')}
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}
                      >
                        {message.role === 'assistant' && message.model && (
                          <Badge variant="outline" className={`text-xs mb-2 ${getModelColor(message.model)}`}>
                            {message.model.toUpperCase()}
                          </Badge>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <span className="text-xs opacity-60 mt-2 block">{message.timestamp.toLocaleTimeString()}</span>
                      </div>
                      {message.role === 'user' && (
                        <div className="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                          <User className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                  {askMutation.isPending && (
                    <div className="flex gap-3 justify-start">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                      <div className="bg-muted rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Thinking...
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            <Separator className="my-4" />

            <div className="flex gap-2 shrink-0">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your analytics, strategy, or content performance..."
                className="resize-none min-h-[60px]"
                disabled={askMutation.isPending}
                data-testid="input-chat-message"
              />
              <Button
                onClick={handleSubmit}
                disabled={!input.trim() || askMutation.isPending}
                size="icon"
                className="h-[60px] w-[60px]"
                data-testid="button-send-message"
              >
                {askMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="w-72 shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="w-5 h-5" />
              Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {exampleQuestions.map((question, i) => (
              <Button
                key={i}
                variant="ghost"
                className="w-full justify-start text-left h-auto py-2 px-3 text-sm hover-elevate"
                onClick={() => handleExampleClick(question)}
                data-testid={`button-suggestion-${i}`}
              >
                {question}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
