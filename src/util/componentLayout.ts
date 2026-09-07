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
import ComponentModel from '../model/Component';
import { makeInner } from './model';


export type ComponentLayoutAvoidSide = 'top' | 'right' | 'bottom' | 'left';

export interface ComponentLayoutInfo {
    rect: BoundingRect
    avoidSide: ComponentLayoutAvoidSide
    relatedCoordSysModelUids: string[]
}

const inner = makeInner<{
    layoutInfo?: ComponentLayoutInfo
}, ComponentModel>();

export function setComponentLayoutInfo(
    componentModel: ComponentModel,
    layoutInfo: ComponentLayoutInfo | null
): void {
    inner(componentModel).layoutInfo = layoutInfo || undefined;
}

export function getComponentLayoutInfo(
    componentModel: ComponentModel
): ComponentLayoutInfo | undefined {
    return inner(componentModel).layoutInfo;
}
