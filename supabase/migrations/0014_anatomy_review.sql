-- image_recognition: image-based practice form for anatomy terms (see the
-- illustration, pick the Hebrew term). Joins the existing four forms; FSRS
-- scheduling is form-agnostic so review_logs is the only schema touchpoint.
alter table public.review_logs drop constraint review_logs_practice_form_check;
alter table public.review_logs add constraint review_logs_practice_form_check
  check (practice_form in
    ('flashcard_recognition', 'flashcard_recall', 'cloze', 'drill', 'image_recognition'));
