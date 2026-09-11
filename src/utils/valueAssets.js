import { supabase } from '../lib/supabase';

const ASSET_SELECT = 'id, project_id, user_id, title, asset_type, content, delivery_scripts, status, created_at';

export const saveValueAsset = async ({ userId, projectId, title, content, deliveryScripts, assetType = 'microactivo_reactivacion' }) => {
  const { data, error } = await supabase
    .from('project_value_assets')
    .insert({
      user_id: userId,
      project_id: projectId || null,
      title: title || null,
      asset_type: assetType,
      content,
      delivery_scripts: deliveryScripts,
    })
    .select(ASSET_SELECT)
    .single();

  return { asset: data || null, error: error?.message };
};

export const getValueAssets = async ({ userId, projectId }) => {
  let query = supabase
    .from('project_value_assets')
    .select(ASSET_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  query = projectId ? query.eq('project_id', projectId) : query.is('project_id', null);

  const { data, error } = await query;
  return { assets: data || [], error: error?.message };
};

export const deleteValueAsset = async (id) => {
  const { error } = await supabase.from('project_value_assets').delete().eq('id', id);
  return { error: error?.message };
};
