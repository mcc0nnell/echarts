/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import BoundingRect from 'zrender/src/core/BoundingRect';
import * as zrUtil from 'zrender/src/core/util';
import * as graphic from '../../util/graphic';
import * as layoutUtil from '../../util/layout';
import * as formatUtil from '../../util/format';
import { createTextStyle, setLabelStyle } from '../../label/labelStyle';
import GlobalModel from '../../model/Global';
import ExtensionAPI from '../../core/ExtensionAPI';
import LegendModel, {
    LegendOption,
    LegendSelectorButtonOption
} from './LegendModel';
import { ZRRectLike, ZRTextAlign } from '../../util/types';
import { createSimpleOverallStageHandler2 } from '../../util/model';
import {
    ComponentLayoutAvoidSide,
    ComponentLayoutInfo,
    setComponentLayoutInfo
} from '../../util/componentLayout';


export const legendLayoutStageHandler = createSimpleOverallStageHandler2(prepareLegendLayout);

function prepareLegendLayout(ecModel: GlobalModel, api: ExtensionAPI): void {
    ecModel.eachComponent('legend', function (legendModel: LegendModel) {
        // Scroll legends have their own paging layout and do not need the
        // multi-row plain-legend reservation handled here.
        if (legendModel.type !== 'legend.plain' || !legendModel.get('show', true)) {
            setComponentLayoutInfo(legendModel, null);
            return;
        }

        setComponentLayoutInfo(legendModel, measureLegendLayout(legendModel, ecModel, api));
    });
}

function measureLegendLayout(
    legendModel: LegendModel,
    ecModel: GlobalModel,
    api: ExtensionAPI
): ComponentLayoutInfo | null {
    let itemAlign = legendModel.get('align');
    const orient = legendModel.get('orient');
    if (!itemAlign || itemAlign === 'auto') {
        itemAlign = legendModel.get('left') === 'right' && orient === 'vertical'
            ? 'right' : 'left';
    }

    const selector = legendModel.get('selector', true) as LegendSelectorButtonOption[];
    let selectorPosition = legendModel.get('selectorPosition', true);
    if (selector && (!selectorPosition || selectorPosition === 'auto')) {
        selectorPosition = orient === 'horizontal' ? 'end' : 'start';
    }

    const avoidSide = getAvoidSide(legendModel, orient);
    if (!avoidSide) {
        return null;
    }

    const group = new graphic.Group();
    const contentGroup = new graphic.Group();
    const selectorGroup = new graphic.Group();
    group.add(contentGroup);
    group.add(selectorGroup);

    const relatedCoordSysModelUids: string[] = [];
    const legendDrawnMap = zrUtil.createHashMap();

    zrUtil.each(legendModel.getData(), function (legendItemModel) {
        const name = legendItemModel.get('name');

        if (name === '' || name === '\\n') {
            const newlineGroup = new graphic.Group() as graphic.Group & {newline?: boolean};
            newlineGroup.newline = true;
            contentGroup.add(newlineGroup);
            return;
        }

        if (legendDrawnMap.get(name)) {
            return;
        }

        const namedSeries = ecModel.getSeriesByName(name);
        if (namedSeries.length) {
            contentGroup.add(createMeasureItem(name, legendItemModel, legendModel, itemAlign));
            zrUtil.each(namedSeries, function (seriesModel) {
                recordRelatedCoordSys(seriesModel.coordinateSystem, relatedCoordSysModelUids);
            });
            legendDrawnMap.set(name, true);
            return;
        }

        ecModel.eachRawSeries(function (seriesModel) {
            if (legendDrawnMap.get(name) || !seriesModel.legendVisualProvider) {
                return;
            }
            if (!seriesModel.legendVisualProvider.containName(name)) {
                return;
            }

            contentGroup.add(createMeasureItem(name, legendItemModel, legendModel, itemAlign));
            recordRelatedCoordSys(seriesModel.coordinateSystem, relatedCoordSysModelUids);
            legendDrawnMap.set(name, true);
        });
    });

    if (!contentGroup.childCount()) {
        return null;
    }

    if (selector) {
        createMeasureSelector(selectorGroup, selector, legendModel);
    }

    const refContainer = layoutUtil.createBoxLayoutReference(legendModel, api).refContainer;
    const positionInfo = legendModel.getBoxLayoutParams();
    const padding = legendModel.get('padding');
    const maxSize = layoutUtil.getLayoutRect(positionInfo, refContainer, padding);
    const mainRect = layoutLegendGroups(
        group,
        contentGroup,
        selectorGroup,
        legendModel,
        maxSize,
        selector,
        selectorPosition
    );
    const layoutRect = layoutUtil.getLayoutRect(
        zrUtil.defaults({
            width: mainRect.width,
            height: mainRect.height
        }, positionInfo),
        refContainer,
        padding
    );
    const paddingArr = formatUtil.normalizeCssArray(padding || 0);

    return {
        rect: new BoundingRect(
            layoutRect.x - paddingArr[3],
            layoutRect.y - paddingArr[0],
            mainRect.width + paddingArr[1] + paddingArr[3],
            mainRect.height + paddingArr[0] + paddingArr[2]
        ),
        avoidSide,
        relatedCoordSysModelUids
    };
}

function createMeasureItem(
    name: string,
    legendItemModel: LegendModel['_data'][number],
    legendModel: LegendModel,
    itemAlign: LegendOption['align']
): graphic.Group {
    const itemWidth = legendModel.get('itemWidth');
    const itemHeight = legendModel.get('itemHeight');
    const itemGroup = new graphic.Group();

    itemGroup.add(new graphic.Rect({
        shape: {x: 0, y: 0, width: itemWidth, height: itemHeight},
        silent: true
    }));

    const textStyleModel = legendItemModel.getModel('textStyle');
    const textColor = textStyleModel.getTextColor();
    const textX = itemAlign === 'left' ? itemWidth + 5 : -5;

    itemGroup.add(new graphic.Text({
        style: createTextStyle(textStyleModel, {
            text: formatLegendText(legendModel, name),
            x: textX,
            y: itemHeight / 2,
            fill: textColor,
            align: itemAlign as ZRTextAlign,
            verticalAlign: 'middle'
        }, {inheritColor: textColor})
    }));

    return itemGroup;
}

function formatLegendText(legendModel: LegendModel, name: string): string {
    const formatter = legendModel.get('formatter');
    if (zrUtil.isString(formatter) && formatter) {
        return formatter.replace('{name}', name != null ? name : '');
    }
    if (zrUtil.isFunction(formatter)) {
        return formatter(name);
    }
    return name;
}

function createMeasureSelector(
    selectorGroup: graphic.Group,
    selector: LegendSelectorButtonOption[],
    legendModel: LegendModel
): void {
    zrUtil.each(selector, function (selectorItem) {
        const labelText = new graphic.Text({
            style: {
                x: 0,
                y: 0,
                align: 'center',
                verticalAlign: 'middle'
            }
        });
        selectorGroup.add(labelText);
        setLabelStyle(
            labelText,
            {
                normal: legendModel.getModel('selectorLabel'),
                emphasis: legendModel.getModel(['emphasis', 'selectorLabel'])
            },
            {defaultText: selectorItem.title}
        );
    });
}

function layoutLegendGroups(
    group: graphic.Group,
    contentGroup: graphic.Group,
    selectorGroup: graphic.Group,
    legendModel: LegendModel,
    maxSize: {width: number, height: number},
    selector: LegendOption['selector'],
    selectorPosition: LegendOption['selectorPosition']
): ZRRectLike {
    layoutUtil.box(
        legendModel.get('orient'), contentGroup, legendModel.get('itemGap'), maxSize.width, maxSize.height
    );

    const contentRect = contentGroup.getBoundingRect();
    const contentPos = [-contentRect.x, -contentRect.y];

    if (!selector) {
        contentGroup.x = contentPos[0];
        contentGroup.y = contentPos[1];
        return group.getBoundingRect();
    }

    layoutUtil.box('horizontal', selectorGroup, legendModel.get('selectorItemGap', true));
    const selectorRect = selectorGroup.getBoundingRect();
    const selectorPos = [-selectorRect.x, -selectorRect.y];
    const selectorButtonGap = legendModel.get('selectorButtonGap', true);
    const orientIdx = legendModel.getOrient().index;
    const wh: 'width' | 'height' = orientIdx === 0 ? 'width' : 'height';
    const hw: 'width' | 'height' = orientIdx === 0 ? 'height' : 'width';
    const yx: 'x' | 'y' = orientIdx === 0 ? 'y' : 'x';

    if (selectorPosition === 'end') {
        selectorPos[orientIdx] += contentRect[wh] + selectorButtonGap;
    }
    else {
        contentPos[orientIdx] += selectorRect[wh] + selectorButtonGap;
    }

    selectorPos[1 - orientIdx] += contentRect[hw] / 2 - selectorRect[hw] / 2;
    selectorGroup.x = selectorPos[0];
    selectorGroup.y = selectorPos[1];
    contentGroup.x = contentPos[0];
    contentGroup.y = contentPos[1];

    const mainRect = {x: 0, y: 0} as ZRRectLike;
    mainRect[wh] = contentRect[wh] + selectorButtonGap + selectorRect[wh];
    mainRect[hw] = Math.max(contentRect[hw], selectorRect[hw]);
    mainRect[yx] = Math.min(0, selectorRect[yx] + selectorPos[1 - orientIdx]);
    return mainRect;
}

function getAvoidSide(
    legendModel: LegendModel,
    orient: LegendOption['orient']
): ComponentLayoutAvoidSide | null {
    const positionInfo = legendModel.getBoxLayoutParams();
    if (orient === 'horizontal') {
        if (positionInfo.top != null && positionInfo.bottom == null) {
            return 'top';
        }
        if (positionInfo.bottom != null && positionInfo.top == null) {
            return 'bottom';
        }
    }
    else {
        if (positionInfo.left != null && positionInfo.right == null) {
            return 'left';
        }
        if (positionInfo.right != null && positionInfo.left == null) {
            return 'right';
        }
    }
    return null;
}

function recordRelatedCoordSys(
    coordinateSystem: unknown,
    relatedCoordSysModelUids: string[]
): void {
    const coordSysModel = coordinateSystem && (coordinateSystem as {model?: {uid?: string}}).model;
    const uid = coordSysModel && coordSysModel.uid;
    if (uid && zrUtil.indexOf(relatedCoordSysModelUids, uid) < 0) {
        relatedCoordSysModelUids.push(uid);
    }
}
