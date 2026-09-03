/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Select, Space, Typography } from 'antd';
import { useFlowEngine } from '@nocobase/flow-engine';
import React, { useMemo } from 'react';

import { useT } from '../locale';
import type { LookupConfig, LookupMapping } from '../utils/types';

export interface LookupMappingEditorProps {
  value?: LookupConfig;
  onChange?: (value: LookupConfig) => void;
  dataSourceKey?: string;
  collectionName?: string;
}

function getFieldOptions(collection: any) {
  return (collection?.getFields?.() ?? [])
    .filter((field: any) => !!field.interface)
    .map((field: any) => ({
      label: field.uiSchema?.title ?? field.title ?? field.name,
      value: field.name,
    }));
}

export function LookupMappingEditor({ value, onChange, dataSourceKey, collectionName }: LookupMappingEditorProps) {
  const t = useT();
  const flowEngine = useFlowEngine();
  const config: LookupConfig = value || { targetCollection: '', targetField: '', mappings: [], searchFields: [] };

  const collectionOptions = useMemo(() => {
    const dataSource = dataSourceKey
      ? flowEngine?.context?.dataSourceManager?.getDataSource?.(dataSourceKey)
      : undefined;
    if (!dataSource) return [];
    return (dataSource.getCollections() ?? [])
      .filter((collection: any) => collection.name !== collectionName)
      .map((collection: any) => ({
        label: collection.title || collection.name,
        value: collection.name,
      }));
  }, [collectionName, dataSourceKey, flowEngine]);

  const targetCollection = useMemo(() => {
    if (!dataSourceKey) return null;
    return flowEngine?.context?.dataSourceManager
      ?.getDataSource?.(dataSourceKey)
      ?.getCollection?.(config.targetCollection);
  }, [config.targetCollection, dataSourceKey, flowEngine]);

  const targetFieldOptions = useMemo(() => getFieldOptions(targetCollection), [targetCollection]);

  const columnOptions = useMemo(() => {
    if (!dataSourceKey) return [];
    const collection = flowEngine?.context?.dataSourceManager
      ?.getDataSource?.(dataSourceKey)
      ?.getCollection?.(collectionName);
    return getFieldOptions(collection);
  }, [collectionName, dataSourceKey, flowEngine]);

  const update = (patch: Partial<LookupConfig>) => {
    onChange?.({ ...config, ...patch });
  };

  const updateMapping = (index: number, patch: Partial<LookupMapping>) => {
    const mappings = config.mappings.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping));
    update({ mappings });
  };

  const removeMapping = (index: number) => {
    update({ mappings: config.mappings.filter((_, i) => i !== index) });
  };

  const addMapping = () => {
    update({ mappings: [...config.mappings, { sourceField: '', targetColumn: '' }] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Space>
        <Typography.Text style={{ width: 80, display: 'inline-block' }}>{t('Target collection')}</Typography.Text>
        <Select
          style={{ minWidth: 200 }}
          value={config.targetCollection || undefined}
          placeholder={t('Target collection')}
          options={collectionOptions}
          onChange={(targetCollection) => update({ targetCollection, targetField: '', mappings: [], searchFields: [] })}
          allowClear
        />
      </Space>
      {config.targetCollection && (
        <>
          <Space>
            <Typography.Text style={{ width: 80, display: 'inline-block' }}>{t('Match field')}</Typography.Text>
            <Select
              style={{ minWidth: 200 }}
              value={config.targetField || undefined}
              placeholder={t('Match field')}
              options={targetFieldOptions}
              onChange={(targetField) => update({ targetField, searchFields: [targetField] })}
              allowClear
            />
          </Space>
          <div>
            <Typography.Text style={{ width: 80, display: 'inline-block' }}>{t('Fill mappings')}</Typography.Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {config.mappings.map((mapping, index) => (
                <Space key={index}>
                  <Select
                    style={{ minWidth: 140 }}
                    size="small"
                    value={mapping.sourceField || undefined}
                    placeholder={t('Source field')}
                    options={targetFieldOptions}
                    onChange={(sourceField) => updateMapping(index, { sourceField })}
                    allowClear
                  />
                  <span>-&gt;</span>
                  <Select
                    style={{ minWidth: 140 }}
                    size="small"
                    value={mapping.targetColumn || undefined}
                    placeholder={t('Target column')}
                    options={columnOptions}
                    onChange={(targetColumn) => updateMapping(index, { targetColumn })}
                    allowClear
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeMapping(index)}
                  />
                </Space>
              ))}
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addMapping} style={{ width: 160 }}>
                {t('Add mapping')}
              </Button>
            </div>
          </div>
          <Space>
            <Typography.Text style={{ width: 80, display: 'inline-block' }}>{t('Search fields')}</Typography.Text>
            <Select
              mode="multiple"
              style={{ minWidth: 240 }}
              value={config.searchFields || []}
              placeholder={t('Search fields')}
              options={targetFieldOptions}
              onChange={(searchFields) => update({ searchFields })}
              allowClear
            />
          </Space>
        </>
      )}
    </div>
  );
}

export default LookupMappingEditor;
