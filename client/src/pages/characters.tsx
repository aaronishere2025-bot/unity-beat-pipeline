import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, User, Edit, Trash2, Upload, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { CharacterProfile, InsertCharacterProfile } from '@shared/schema';

const characterSchema = z.object({
  name: z.string().min(1, 'Character name is required'),
  refImageUrl: z.string().url('Must be a valid URL'),
  basePrompt: z.string().min(10, 'Base prompt must be at least 10 characters'),
  priority: z.string().default('1'),
});

type CharacterFormValues = z.infer<typeof characterSchema>;

// Helper function to get priority label and badge variant
function getPriorityDisplay(priority: string | number) {
  const priorityValue = typeof priority === 'string' ? parseFloat(priority) : priority;

  switch (priorityValue) {
    case 3:
      return { label: 'Main', variant: 'default' as const };
    case 2:
      return { label: 'Active Side', variant: 'secondary' as const };
    case 1:
      return { label: 'Side', variant: 'outline' as const };
    case 0.5:
      return { label: 'Background', variant: 'outline' as const };
    default:
      return { label: 'Side', variant: 'outline' as const };
  }
}

export default function CharactersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: charactersData, isLoading } = useQuery<{ data: CharacterProfile[] }>({
    queryKey: ['/api/character-profiles'],
  });

  const form = useForm<CharacterFormValues>({
    resolver: zodResolver(characterSchema),
    defaultValues: {
      name: '',
      refImageUrl: '',
      basePrompt: '',
      priority: '1',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertCharacterProfile) => apiRequest('POST', '/api/character-profiles', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/character-profiles'] });
      toast({
        title: 'Character Created',
        description: 'Your character profile has been created successfully.',
      });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create character',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertCharacterProfile> }) =>
      apiRequest('PATCH', `/api/character-profiles/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/character-profiles'] });
      toast({
        title: 'Character Updated',
        description: 'Your character profile has been updated successfully.',
      });
      setDialogOpen(false);
      setEditingCharacter(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update character',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/character-profiles/${id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/character-profiles'] });
      toast({
        title: 'Character Deleted',
        description: 'The character profile has been deleted.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete character',
        variant: 'destructive',
      });
    },
  });

  const handleImageUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid File Type',
        description: 'Only JPG, JPEG, PNG, and WEBP images are allowed.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Image must be smaller than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload-character-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      const imageUrl = result.data.url;

      // Set preview and form value
      setPreviewUrl(imageUrl);
      form.setValue('refImageUrl', imageUrl, { shouldValidate: true });

      toast({
        title: 'Image Uploaded',
        description: 'Character image has been uploaded successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onSubmit = (data: CharacterFormValues) => {
    const submitData = {
      ...data,
      priority: parseFloat(data.priority),
    };

    if (editingCharacter) {
      updateMutation.mutate({ id: editingCharacter.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (character: CharacterProfile) => {
    setEditingCharacter(character);
    setPreviewUrl(character.refImageUrl);
    form.reset({
      name: character.name,
      refImageUrl: character.refImageUrl,
      basePrompt: character.basePrompt,
      priority: String(character.priority),
    });
    setDialogOpen(true);
  };

  const handleNewCharacter = () => {
    setEditingCharacter(null);
    setPreviewUrl('');
    form.reset({
      name: '',
      refImageUrl: '',
      basePrompt: '',
      priority: '1',
    });
    setDialogOpen(true);
  };

  const characters = charactersData?.data || [];

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold mb-2" data-testid="text-page-title">
              Character Profiles
            </h1>
            <p className="text-muted-foreground">Manage character references for consistent character mode</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={handleNewCharacter} data-testid="button-add-character">
                <Plus className="w-4 h-4" />
                Add Character
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingCharacter ? 'Edit Character' : 'Create Character Profile'}</DialogTitle>
                <DialogDescription>
                  {editingCharacter
                    ? 'Update the character profile details'
                    : 'Add a new character for use in consistent character mode'}
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Character Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Ryder the Astronaut"
                            {...field}
                            data-testid="input-character-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="refImageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reference Image</FormLabel>
                        <FormControl>
                          <div>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/jpeg,image/jpg,image/png,image/webp"
                              onChange={handleFileSelect}
                              className="hidden"
                              data-testid="input-file"
                            />

                            {!previewUrl ? (
                              <div
                                onClick={() => fileInputRef.current?.click()}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-lg p-8 text-center cursor-pointer hover-elevate active-elevate-2"
                                data-testid="drop-zone"
                              >
                                {uploading ? (
                                  <>
                                    <Loader2 className="mx-auto h-12 w-12 text-muted-foreground animate-spin" />
                                    <p className="mt-2 text-sm text-muted-foreground">Uploading...</p>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
                                    <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                      Drag and drop image here, or click to browse
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                                      JPG, JPEG, PNG, or WEBP (max 5MB)
                                    </p>
                                  </>
                                )}
                              </div>
                            ) : (
                              <div
                                className="relative border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-lg p-4"
                                data-testid="image-preview"
                              >
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="absolute top-2 right-2"
                                  onClick={() => {
                                    setPreviewUrl('');
                                    form.setValue('refImageUrl', '', { shouldValidate: true });
                                  }}
                                  data-testid="button-remove-image"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                <img
                                  src={previewUrl}
                                  alt="Character preview"
                                  className="max-h-64 mx-auto rounded-lg shadow-lg dark:shadow-2xl"
                                />
                              </div>
                            )}

                            <input type="hidden" {...field} />
                          </div>
                        </FormControl>
                        <FormDescription>Upload a character reference image for IP-Adapter</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basePrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Prompt</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="grainy 2007 CGI found-footage style, handheld cam shake, low gravity walk, sci-fi horror aesthetic, film grain, VHS glitch at end, hoodie with scorch marks"
                            className="min-h-[100px] font-mono text-sm"
                            {...field}
                            data-testid="input-base-prompt"
                          />
                        </FormControl>
                        <FormDescription>
                          Universal style prompt applied to all videos with this character
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Character Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-priority">
                              <SelectValue placeholder="Select priority level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="3" data-testid="option-priority-main">
                              Main Character
                            </SelectItem>
                            <SelectItem value="2" data-testid="option-priority-active-side">
                              Active Side Character
                            </SelectItem>
                            <SelectItem value="1" data-testid="option-priority-side">
                              Side Character
                            </SelectItem>
                            <SelectItem value="0.5" data-testid="option-priority-background">
                              Background Character
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Main characters appear in ~75% of scenes, active side characters in ~35%, side characters in
                          ~15%, background in ~5%
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="button-save-character"
                    >
                      {editingCharacter ? 'Update' : 'Create'} Character
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Characters Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-8 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : characters.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12" data-testid="empty-state-no-characters">
              <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No characters yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first character profile to use consistent character mode
              </p>
              <Button onClick={handleNewCharacter} data-testid="button-create-first-character">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Character
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map((character) => (
              <Card key={character.id} data-testid={`card-character-${character.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={character.refImageUrl} alt={character.name} />
                        <AvatarFallback>
                          <User className="w-6 h-6" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg" data-testid={`text-character-name-${character.id}`}>
                            {character.name}
                          </CardTitle>
                          <Badge
                            variant={getPriorityDisplay(character.priority).variant}
                            data-testid={`badge-priority-${character.id}`}
                          >
                            {getPriorityDisplay(character.priority).label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(character.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-sm text-muted-foreground line-clamp-3 font-mono"
                    data-testid={`text-base-prompt-${character.id}`}
                  >
                    {character.basePrompt}
                  </p>
                </CardContent>
                <CardFooter className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleEdit(character)}
                    data-testid={`button-edit-${character.id}`}
                  >
                    <Edit className="w-3 h-3" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => deleteMutation.mutate(character.id)}
                    data-testid={`button-delete-${character.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
