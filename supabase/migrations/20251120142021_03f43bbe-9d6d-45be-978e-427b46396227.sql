-- Create table to store train names over time
CREATE TABLE public.train_names (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security (allow public read access)
ALTER TABLE public.train_names ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read train names (public data)
CREATE POLICY "Anyone can view train names" 
ON public.train_names 
FOR SELECT 
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_train_names_name ON public.train_names(name);
CREATE INDEX idx_train_names_last_seen ON public.train_names(last_seen DESC);