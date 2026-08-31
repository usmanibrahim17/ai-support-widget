create extension if not exists vector;

create or replace function public.match_chunks(
  query_embedding vector(768),
  match_count int default 3,
  filter_business_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity double precision
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks as c
  join public.documents as d on d.id = c.document_id
  where c.embedding is not null
    and (filter_business_id is null or d.business_id = filter_business_id)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
