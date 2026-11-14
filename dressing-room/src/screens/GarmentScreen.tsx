import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addToDraft, deleteGarment, updateGarmentMeta, type GarmentMeta } from '../db/repo';
import { db } from '../db/schema';
import { he } from '../i18n/he';
import { MetaForm } from '../import/MetaForm';
import { errorText } from '../ui/errors';
import { IconTrash } from '../ui/icons';
import { Page } from '../ui/Page';
import { Thumb } from '../ui/Thumb';
import { toast, toastError } from '../ui/toast';

export function GarmentScreen() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const garment = useLiveQuery(() => db.garments.get(id).then((g) => g ?? null), [id]);
  const [meta, setMeta] = useState<GarmentMeta | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (garment && !dirty) setMeta({ name: garment.name, category: garment.category, tags: garment.tags });
  }, [garment, dirty]);

  if (garment === undefined) return <Page title="">{null}</Page>;
  if (garment === null || !meta) {
    return <Page title={he.wardrobe.title}><p className="p-8 text-center text-muted">{he.garment.notFound}</p></Page>;
  }

  const save = async () => {
    try {
      await updateGarmentMeta(garment.id, { ...meta, name: meta.name.trim() || he.categoryOne[meta.category] });
      setDirty(false);
      toast(he.garment.saved);
    } catch (e) { toastError(errorText(e, he.errors.saveFailed)); }
  };
  const tryOn = async () => {
    try {
      if (dirty) await save();
      await addToDraft(garment);
      nav('/');
    } catch (e) { toastError(errorText(e)); }
  };
  const remove = async () => {
    if (!confirm(he.garment.deleteConfirm)) return;
    try {
      await deleteGarment(garment.id);
      toast(he.garment.deleted);
      nav(-1);
    } catch (e) { toastError(errorText(e)); }
  };

  return (
    <Page
      title={garment.name}
      footer={
        <div className="flex gap-2">
          <button className="btn btn-ghost !px-4" onClick={() => void remove()} aria-label={he.common.delete}><IconTrash /></button>
          {dirty && <button className="btn btn-ghost flex-1" onClick={() => void save()}>{he.common.save}</button>}
          <button className="btn btn-primary flex-1" onClick={() => void tryOn()}>{he.garment.tryOn}</button>
        </div>
      }
    >
      <div className="space-y-5 p-4">
        <div className="checker mx-auto aspect-[3/4] max-h-[42vh] rounded-3xl border border-line p-3">
          <Thumb blob={garment.render} alt={garment.name} />
        </div>
        {garment.body.kind === 'design' && (
          <Link to={`/studio/edit/${garment.id}`} className="btn btn-ghost w-full">{he.studio.editInStudio}</Link>
        )}
        {garment.body.kind === 'raster' && (
          <Link to={`/garment/${garment.id}/edit`} className="btn btn-ghost w-full">{he.edit.open}</Link>
        )}
        <MetaForm value={meta} onChange={(m) => { setMeta(m); setDirty(true); }} />
      </div>
    </Page>
  );
}
