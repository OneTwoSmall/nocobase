/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer, useFieldSchema } from '@formily/react';
import { useAPIClient, useCollection_deprecated, useTableBlockContext } from '@nocobase/client';
import { useT } from '../locale';
import {
  ENHANCED_TABLE_WRAPPER_CSS,
  SelectionStatsPopup,
  isNumericField,
  useCellSelection,
  useSummaryRowSync,
  type SummaryColumnMeta,
  type SummaryConfig,
} from '../../client-v2/enhanced-table/tableDomEnhancer';

const EMPTY_CONFIG: SummaryConfig = {};

let enableEnhancedTable = true;

export function setEnhancedTableEnabled(enabled: boolean) {
  enableEnhancedTable = enabled;
}

export function isEnhancedTableEnabled() {
  return enableEnhancedTable;
}

/**
 * v1 表格区块装饰器：为 TableV2 提供汇总行与单元格圈选统计。
 * 作为 schema 的 x-decorator 渲染，TableBlockProvider 提供 block context。
 */
export const EnhancedTableV1Wrapper = observer((props: any) => {
  if (!isEnhancedTableEnabled()) {
    return <>{props.children}</>;
  }
  return <EnhancedTableV1WrapperInner {...props} />;
});

const EnhancedTableV1WrapperInner = observer((props: any) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const fieldSchema = useFieldSchema();
  const blockContext = useTableBlockContext();
  const collection = useCollection_deprecated();
  const api = useAPIClient();
  const [allPagesData, setAllPagesData] = useState<any[]>([]);

  const config: SummaryConfig = fieldSchema?.['x-decorator-props']?.summaryConfig || EMPTY_CONFIG;
  const configKey = JSON.stringify(config);

  const columnMeta: SummaryColumnMeta = useMemo(() => {
    const numericFields = new Set<string>();
    const columnTitles: Record<string, string> = {};
    collection?.fields?.forEach((field: any) => {
      columnTitles[field.name] = field.uiSchema?.title || field.title || field.name;
      if (isNumericField(field)) {
        numericFields.add(field.name);
      }
    });
    return { numericFields, columnTitles };
  }, [collection]);

  const paramsStr = JSON.stringify(blockContext?.service?.params?.[0] || {});
  const resourceDataStr = JSON.stringify(blockContext?.service?.data?.data || []);

  useEffect(() => {
    if (Object.keys(config).length === 0 || !blockContext?.service) {
      setAllPagesData([]);
      return;
    }

    let isMounted = true;
    const fetchAllData = async () => {
      try {
        const requestParams = {
          ...(blockContext.service?.params?.[0] || {}),
          paginate: false,
        };
        let responseData;
        if (blockContext.resource && typeof blockContext.resource.list === 'function') {
          const response = await blockContext.resource.list(requestParams);
          responseData = response?.data;
        } else {
          const resourceName =
            typeof blockContext.resource === 'string'
              ? blockContext.resource
              : blockContext.association || blockContext.collection?.name;
          if (!resourceName) return;
          const response = await api.request({
            url: `${resourceName}:list`,
            params: requestParams,
          });
          responseData = response?.data;
        }

        if (!isMounted) return;
        let rows: any[] = [];
        if (Array.isArray(responseData)) {
          rows = responseData;
        } else if (responseData && Array.isArray(responseData.data)) {
          rows = responseData.data;
        } else if (responseData && Array.isArray(responseData.rows)) {
          rows = responseData.rows;
        }
        setAllPagesData(rows);
      } catch (err) {
        console.error('EnhancedTable fetchAllData Error: ', err);
      }
    };

    fetchAllData();
    return () => {
      isMounted = false;
    };
    // config 引用不稳定，用序列化字符串做依赖避免反复拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, paramsStr, resourceDataStr, blockContext, api]);

  const labels = useMemo(
    () => ({
      sum: t('Sum'),
      avg: t('Average'),
      count: t('Count'),
      min: t('Min'),
      max: t('Max'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configKey],
  );

  useSummaryRowSync(containerRef, config, allPagesData, columnMeta, labels);
  const { selectionStats, mousePos } = useCellSelection(containerRef, columnMeta);

  return (
    <div className={ENHANCED_TABLE_WRAPPER_CSS} ref={containerRef}>
      {props.children}
      {selectionStats && mousePos ? <SelectionStatsPopup stats={selectionStats} pos={mousePos} t={t} /> : null}
    </div>
  );
});

export default EnhancedTableV1Wrapper;
