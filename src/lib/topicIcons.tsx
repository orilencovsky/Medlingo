import {
  HeartPulse, Wind, Brain, Bone, Pill, Stethoscope, Ambulance,
  Baby, Bug, Activity, Tag, PersonStanding, Droplets, Thermometer, ShieldPlus,
  Microscope, Venus, ClipboardList, type LucideIcon,
} from 'lucide-react';
import type { Topic } from './topics';

const MAP: Record<Topic, LucideIcon> = {
  anatomy: PersonStanding, symptoms: Thermometer, cardiology: HeartPulse, respiratory: Wind,
  gastro: Activity, neuro: Brain, msk: Bone, genitourinary: Droplets, endocrine: ShieldPlus,
  dermatology: Droplets, medications: Pill, procedures: Stethoscope, lab_imaging: Microscope,
  emergency: Ambulance, mental_health: Brain, obgyn: Venus, pediatrics: Baby,
  infectious: Bug, general: ClipboardList,
};

export function topicIcon(slug: Topic): LucideIcon {
  return MAP[slug] ?? Tag;
}
