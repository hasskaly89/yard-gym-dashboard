import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type NoteRow = {
  id: string;
  note: string;
  authorName: string;
  authorId: string;
  createdAt: string;
};

export type NotesResponse = {
  notes: NoteRow[];
};

// Running comment thread for a single client, newest first.
export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get('memberId');
  if (!memberId) {
    return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('member_notes')
    .select('id, note, author_name, author_id, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notes: NoteRow[] = (data ?? []).map((row) => ({
    id: row.id,
    note: row.note,
    authorName: row.author_name,
    authorId: row.author_id,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ notes } satisfies NotesResponse);
}
