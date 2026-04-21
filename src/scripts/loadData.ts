import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(url, anonKey);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const csvPath = path.resolve(__dirname, '../../inscripciones-talleres-2026-04-20.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('Archivo CSV no encontrado para carga masiva.');
    return;
  }
  const fileContent = fs.readFileSync(csvPath, 'utf8');

  let cleanContent = fileContent;
  if (cleanContent.charCodeAt(0) === 0xFEFF) {
    cleanContent = cleanContent.slice(1);
  }

  const result = Papa.parse(cleanContent, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  });

  const rows = result.data as any[];
  console.log(`Leídas ${rows.length} filas del Excel.`);

  const workshopsSet = new Set<string>();
  const workshopsMap = new Map<string, string>();

  for (const row of rows) {
    const keys = Object.keys(row);
    const titleKey = keys.find(k => k.includes('Taller')) || keys[0];
    const title = row[titleKey];
    const level = row['Nivel'];
    if (title && level) {
      workshopsSet.add(`${title.trim()}|${level.trim()}`);
    }
  }

  for (const w of workshopsSet) {
    const [title, level] = w.split('|');
    let { data: existingWorkshop } = await supabase
      .from('workshops')
      .select('id')
      .eq('title', title)
      .eq('target_level', level)
      .maybeSingle();

    if (!existingWorkshop) {
      const { data: newWorkshop, error } = await supabase
        .from('workshops')
        .insert({
          title,
          target_level: level,
          capacity: 40,
          is_active: true,
          teacher: 'Sin Asignar'
        })
        .select()
        .single();
      
      if (error) continue;
      existingWorkshop = newWorkshop;
    }
    workshopsMap.set(w, existingWorkshop!.id);
  }

  for (const row of rows) {
    const keys = Object.keys(row);
    const titleKey = keys.find(k => k.includes('Taller')) || keys[0];
    
    const fullName = row['Estudiante']?.trim();
    const rut = row['RUT']?.trim();
    const course = row['Curso']?.trim();
    const workshopTitle = row[titleKey]?.trim();
    const level = row['Nivel']?.trim();

    if (!rut || !workshopTitle) continue;

    const { data: existingStudent } = await supabase
      .from('students')
      .select('id')
      .eq('rut', rut)
      .maybeSingle();

    if (!existingStudent) {
      await supabase.from('students').insert({
        rut,
        name: fullName,
        course
      });
    }

    const workshopId = workshopsMap.get(`${workshopTitle}|${level}`);
    if (workshopId) {
      const { data: existingEnrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('student_rut', rut)
        .eq('workshop_id', workshopId)
        .maybeSingle();

      if (!existingEnrollment) {
        await supabase.from('enrollments').insert({
          workshop_id: workshopId,
          student_name: fullName,
          student_rut: rut,
          course,
          subject: workshopTitle
        });
      }
    }
  }
}

main().catch(console.error);
